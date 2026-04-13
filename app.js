// app.js - Post Authentication Logic
// ==========================================
// BACKEND CONFIGURATION
// ==========================================
const API_BASE = 'https://dailypaw-api.onrender.com';
const DEV_MODE = false;

// State Variables
let user = null;
let userProfile = null;
let allPets = [];
let activePetId = localStorage.getItem('activePetId');
let petProfile = JSON.parse(localStorage.getItem('petProfile') || 'null');
window.alertDismissedPetIds = JSON.parse(localStorage.getItem('dailyPaw_dismissedAlerts') || '{}');

const translations = {
    en: {
        welcome: "Welcome back",
        saving: "Saving...",
        saved: "Saved ✓",
        uploading: "Uploading...",
        analyzing: "Analyzing...",
        error_connect: "Oops! Couldn't connect to the server.",
        health_normal: "🌱 Everything looks good! Your pet is within normal parameters.",
        health_warning: "🔍 Warning: Some parameters require attention.",
        health_critical: "⚠️ Critical Alert: Immediate veterinary evaluation recommended.",
        delete_confirm: "Are you sure?",
        wow_hungry: "Wow, someone's hungry!",
        ai_greeting: "Hello! 🐾 I'm your DailyPaw Veterinary Assistant. How can I help your pet today?",
        report_placeholder: "Analyzing recent logs to build your weekly insight...",
        generate_report: "Generate Now",
        syncing: "Syncing latest 24h health data..."
    }
};

const i18n = translations.en;

function resetScannerModal() {
    const scannerPreview = document.getElementById('scanner-preview-container');
    const previewImg = document.getElementById('scanner-preview-img');
    const contextContainer = document.getElementById('food-scanner-context-container');
    const foodResult = document.getElementById('food-scan-result-container');
    const scanFoodBtn = document.getElementById('scan-food-btn');
    const cameraInput = document.getElementById('camera-input');
    const contextInput = document.getElementById('food-context-input');
    const analyzeFinalBtn = document.getElementById('analyze-food-final-btn');

    if (previewImg) previewImg.src = '';
    if (scannerPreview) scannerPreview.style.display = 'none';
    if (contextContainer) contextContainer.style.display = 'none';
    if (foodResult) {
        foodResult.style.display = 'none';
        foodResult.innerHTML = '';
    }
    if (scanFoodBtn) {
        scanFoodBtn.style.display = 'flex';
        scanFoodBtn.disabled = false;
        scanFoodBtn.innerHTML = '<span>📸</span> Scan Food';
    }
    if (cameraInput) cameraInput.value = '';
    if (contextInput) contextInput.value = '';
    if (analyzeFinalBtn) {
        analyzeFinalBtn.disabled = false;
        analyzeFinalBtn.innerHTML = '✨ Analyze Now';
    }
    window.currentCapturedFile = null;
}


document.addEventListener('DOMContentLoaded', async () => {

    // --- Onboarding Logic ---
    let isGeneratingReport = false;
    const onboardingForm = document.getElementById('onboarding-form');

    if (onboardingForm) {
        const photoInput = document.getElementById('petPhotoInput');
        const previewImg = document.getElementById('petPhotoPreview');
        const emptyState = document.getElementById('onboarding-avatar-empty');
        const submitBtn = document.getElementById('onboarding-submit-btn');
        const petNameInput = document.getElementById('pet-name');
        const breedInput = document.getElementById('pet-breed');
        const speciesInput = document.getElementById('pet-species');
        const activityInput = document.getElementById('pet-activity');
        const editIcon = document.getElementById('onboarding-avatar-edit');

        window.selectedSpecies = 'Dog';
        window.selectedActivity = 'moderate';

        if (photoInput) {
            photoInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const objectUrl = URL.createObjectURL(file);
                    previewImg.src = objectUrl;
                    previewImg.style.display = 'block';
                    if (emptyState) emptyState.style.display = 'none';
                    if (editIcon) editIcon.style.display = 'flex';
                    previewImg.onload = () => URL.revokeObjectURL(objectUrl);
                    validateForm();
                }
            });
        }

        function validateForm() {
            const isNameValid = petNameInput && petNameInput.value.trim().length >= 1;
            const isBreedValid = breedInput && breedInput.value.trim().length >= 1;
            const ageVal = document.getElementById('pet-age').value;
            const weightVal = document.getElementById('pet-weight').value;
            const isComplete = isNameValid && isBreedValid && ageVal !== '' && weightVal !== '' && !isNaN(parseFloat(weightVal));
            if (submitBtn) submitBtn.disabled = !isComplete;
        }

        if (petNameInput) petNameInput.addEventListener('input', validateForm);
        const ageInput = document.getElementById('pet-age');
        const weightInput = document.getElementById('pet-weight');
        if (ageInput) ageInput.addEventListener('input', validateForm);
        if (weightInput) weightInput.addEventListener('input', validateForm);

        const breedOverlay = document.getElementById('breed-modal-overlay');
        const closeBreedModal = document.getElementById('close-breed-modal');
        const breedSearchInputInner = document.getElementById('breed-search-input');
        const breedOptionsContainer = document.getElementById('breed-options-container');
        const customBreedInput = document.getElementById('custom-breed-input');
        const useCustomBreedBtn = document.getElementById('use-custom-breed-btn');

        if (breedInput && breedOverlay) {
            // Open Modal
            breedInput.addEventListener('click', () => {
                breedOverlay.style.display = 'flex';
                if(breedSearchInputInner) breedSearchInputInner.focus();
            });

            // Close Modal bindings
            const closeModal = () => {
                breedOverlay.style.display = 'none';
                if(breedSearchInputInner) breedSearchInputInner.value = '';
                if(customBreedInput) customBreedInput.value = '';
                
                // Reset filter layout on close
                if(breedOptionsContainer) {
                    Array.from(breedOptionsContainer.children).forEach(card => card.style.display = 'flex');
                }
            };

            if(closeBreedModal) closeBreedModal.addEventListener('click', closeModal);
            breedOverlay.addEventListener('click', (e) => {
                if (e.target === breedOverlay) closeModal();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && breedOverlay.style.display === 'flex') closeModal();
            });

            // Live Search Filter
            if(breedSearchInputInner) {
                breedSearchInputInner.addEventListener('input', (e) => {
                    const term = e.target.value.toLowerCase();
                    Array.from(breedOptionsContainer.children).forEach(card => {
                        const breedName = card.querySelector('.card-label').textContent.toLowerCase();
                        card.style.display = breedName.includes(term) ? 'flex' : 'none';
                    });
                });
            }

            // Handle Custom Entry
            if(useCustomBreedBtn) {
                useCustomBreedBtn.addEventListener('click', () => {
                    const customVal = customBreedInput.value.trim();
                    if (customVal) {
                        breedInput.value = customVal;
                        closeModal();
                        validateForm();
                    }
                });
            }

            // Helper to render grid
            window.renderBreedGrid = (breedsDataArr) => {
                breedOptionsContainer.innerHTML = '';
                breedsDataArr.forEach(breed => {
                    const card = document.createElement('div');
                    card.className = 'breed-option-card';
                    card.innerHTML = `
                        <span class="card-label">${breed}</span>
                        <span class="check-icon">✓</span>
                    `;
                    card.addEventListener('click', () => {
                        breedInput.value = breed;
                        closeModal();
                        validateForm();
                    });
                    breedOptionsContainer.appendChild(card);
                });
            };
        }

        document.querySelectorAll('.species-card').forEach(card => {
            card.addEventListener('click', function () {
                document.querySelectorAll('.species-card').forEach(c => c.classList.remove('active', 'selected'));
                this.classList.add('active', 'selected');
                window.selectedSpecies = this.dataset.value;
                if (speciesInput) speciesInput.value = window.selectedSpecies;
                
                // --- ONBOARDING BREED DYNAMIC LOGIC (MODAL) ---
                if (breedInput && breedOptionsContainer) {
                    const breedsData = {
                        Dog: ["Affenpinscher", "Afghan Hound", "Airedale Terrier", "Akita", "Alaskan Malamute", "American Bulldog", "American Pit Bull Terrier", "American Staffordshire Terrier", "Anatolian Shepherd", "Australian Cattle Dog", "Australian Shepherd", "Basset Hound", "Beagle", "Belgian Malinois", "Bernese Mountain Dog", "Bichon Frise", "Bloodhound", "Border Collie", "Border Terrier", "Boston Terrier", "Boxer", "Boykin Spaniel", "Brittany", "Brussels Griffon", "Bull Terrier", "Bulldog", "Bullmastiff", "Cairn Terrier", "Cane Corso", "Cardigan Welsh Corgi", "Cavalier King Charles Spaniel", "Chesapeake Bay Retriever", "Chihuahua", "Chinese Crested", "Chinese Shar-Pei", "Chow Chow", "Collie", "Coonhound", "Corgi", "Cotons de Tulear", "Dachshund", "Dalmatian", "Doberman Pinscher", "Dogo Argentino", "English Cocker Spaniel", "English Mastiff", "English Setter", "English Springer Spaniel", "English Toy Spaniel", "French Bulldog", "German Shepherd", "German Shorthaired Pointer", "German Wirehaired Pointer", "Giant Schnauzer", "Golden Retriever", "Gordon Setter", "Great Dane", "Great Pyrenees", "Greyhound", "Havanese", "Irish Setter", "Irish Wolfhound", "Italian Greyhound", "Jack Russell Terrier", "Japanese Chin", "Keeshond", "Kerry Blue Terrier", "Labradoodle", "Labrador Retriever", "Lhasa Apso", "Maltese", "Mastiff", "Miniature Pinscher", "Miniature Schnauzer", "Newfoundland", "Norfolk Terrier", "Norwegian Elkhound", "Papillon", "Pekingese", "Pembroke Welsh Corgi", "Pit Bull", "Pomeranian", "Poodle", "Portuguese Water Dog", "Pug", "Rhodesian Ridgeback", "Rottweiler", "Saint Bernard", "Saluki", "Samoyed", "Schipperke", "Scottish Deerhound", "Scottish Terrier", "Shetland Sheepdog", "Shiba Inu", "Shih Tzu", "Siberian Husky", "Staffordshire Bull Terrier", "Standard Schnauzer", "Tibetan Mastiff", "Tibetan Terrier", "Vizsla", "Weimaraner", "Welsh Terrier", "West Highland White Terrier", "Whippet", "Yorkshire Terrier", "Mixed / Mutt"],
                        Cat: ["Abyssinian", "American Bobtail", "American Curl", "American Shorthair", "American Wirehair", "Balinese", "Bengal", "Birman", "Bombay", "British Shorthair", "Burmese", "Burmilla", "Chartreux", "Colorpoint Shorthair", "Cornish Rex", "Devon Rex", "Domestic Longhair", "Domestic Mediumhair", "Domestic Shorthair", "Egyptian Mau", "European Shorthair", "Exotic Shorthair", "Havana Brown", "Himalayan", "Japanese Bobtail", "Khao Manee", "Korat", "LaPerm", "Maine Coon", "Manx", "Munchkin", "Nebelung", "Norwegian Forest Cat", "Ocicat", "Oriental", "Persian", "Peterbald", "Pixie-bob", "Ragamuffin", "Ragdoll", "Russian Blue", "Savannah", "Scottish Fold", "Selkirk Rex", "Siamese", "Siberian", "Singapura", "Snowshoe", "Somali", "Sphynx", "Tonkinese", "Turkish Angora", "Turkish Van", "Mixed"],
                        Bird: ["African Grey Parrot", "Amazon Parrot", "Budgerigar (Parakeet)", "Caique", "Canary", "Cockatiel", "Cockatoo", "Conure", "Dove", "Eclectus Parrot", "Finch", "Lorikeet", "Lovebird", "Macaw", "Parrotlet", "Pigeon", "Quaker Parrot", "Toucan"],
                        Other: []
                    };
                    const availableBreeds = breedsData[window.selectedSpecies] || [];
                    breedInput.value = ''; // Reset UI choice
                    window.renderBreedGrid(availableBreeds);
                }
                
                validateForm();
            });
        });

        // Trigger default species selection to pre-populate breeds on load
        const defaultSpecies = document.querySelector('.species-card.selected');
        if (defaultSpecies) {
            defaultSpecies.click();
            if(breedInput) breedInput.value = ''; // Prevent auto-filling value if empty
        }

        document.querySelectorAll('.activity-card').forEach(card => {
            card.addEventListener('click', function () {
                document.querySelectorAll('.activity-card').forEach(c => c.classList.remove('active', 'selected'));
                this.classList.add('active', 'selected');
                window.selectedActivity = this.dataset.value;
                if (activityInput) activityInput.value = window.selectedActivity;
                validateForm();
            });
        });

        onboardingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const allowed = await checkFeatureLimit('PET_REGISTRATION');
            if (!allowed) return;

            const btn = onboardingForm.querySelector('button[type="submit"]');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = i18n.uploading;

            try {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (!session) throw new Error("No active session");
                const user = session.user;

                const payload = {
                    owner_id: user.id,
                    name: petNameInput.value,
                    species: window.selectedSpecies,
                    breed: breedInput.value || 'Mixed',
                    age: document.getElementById('pet-age').value || 0,
                    weight: document.getElementById('pet-weight').value || 0,
                    activity: window.selectedActivity,
                    photo_url: 'https://vsqscvtyqntizpmsavjr.supabase.co/storage/v1/object/public/pets/default_paw.png'
                };

                if (photoInput?.files?.[0]) {
                    const file = photoInput.files[0];
                    const fileName = `${user.id}-${Date.now()}.${file.name.split('.').pop()}`;
                    const { error: uploadError } = await window.supabaseClient.storage.from('pets').upload(fileName, file);
                    if (!uploadError) {
                        const { data: { publicUrl } } = window.supabaseClient.storage.from('pets').getPublicUrl(fileName);
                        payload.photo_url = publicUrl;
                    }
                }

                btn.textContent = i18n.saving;
                const { data, error: insertError } = await window.supabaseClient.from('pets').insert([payload]).select().single();
                if (insertError) throw insertError;

                localStorage.setItem('activePetId', data.id);
                localStorage.setItem('petProfile', JSON.stringify(data));
                btn.textContent = i18n.saved;
                setTimeout(() => window.location.href = '/dashboard', 500);

            } catch (err) {
                console.error("Critical onboarding failure:", err);
                alert("Submission failed: " + err.message);
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }

    // --- AUTH CHECK ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'index.html';
        return;
    }
    user = session.user;

    // --- GLOBALLY SCOPED UI FUNCTIONS ---
    function hydratePetSwitcher() {
        const itemsContainer = document.getElementById('switcher-items');
        const currentName = document.getElementById('current-pet-name');
        const currentAvatar = document.getElementById('current-pet-avatar-container');
        const container = document.getElementById('custom-pet-switcher');
        const activePet = allPets.find(p => p.id === activePetId) || allPets[0];

        if (activePet && currentName) {
            currentName.textContent = activePet.name;
            if (currentAvatar) {
                currentAvatar.innerHTML = activePet.photo_url
                    ? `<img src="${activePet.photo_url}" alt="${activePet.name}">`
                    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 2.67-2.74 4-3.26a1 1 0 0 1 1.28 1.5l-.81 3.22a6.5 6.5 0 1 1-12.94 0L4.72 3.5a1 1 0 0 1 1.28-1.5c1.33.52 2.22 1.26 4 3.26.65-.17 1.33-.26 2-.26Z"/><path d="M7 14h.01"/><path d="M12 14h.01"/><path d="M17 14h.01"/><path d="M7 18h.01"/><path d="M12 18h.01"/><path d="M17 18h.01"/></svg>`;
            }
        }

        if (itemsContainer) {
            itemsContainer.innerHTML = allPets.map(pet => {
                const isActive = pet.id === activePetId;
                const avatar = pet.photo_url ? `<img src="${pet.photo_url}" alt="${pet.name}">` : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 2.67-2.74 4-3.26a1 1 0 0 1 1.28 1.5l-.81 3.22a6.5 6.5 0 1 1-12.94 0L4.72 3.5a1 1 0 0 1 1.28-1.5c1.33.52 2.22 1.26 4 3.26.65-.17 1.33-.26 2-.26Z"/><path d="M7 14h.01"/><path d="M12 14h.01"/><path d="M17 14h.01"/><path d="M7 18h.01"/><path d="M12 18h.01"/><path d="M17 18h.01"/></svg>`;
                return `<div class="switcher-item ${isActive ? 'active' : ''}" data-id="${pet.id}"><div class="switcher-avatar-container">${avatar}</div><span class="item-name">${pet.name}</span><svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>`;
            }).join('');

            itemsContainer.querySelectorAll('.switcher-item').forEach(item => {
                item.onclick = async (e) => {
                    const petId = item.getAttribute('data-id');
                    if (petId === activePetId) { container?.classList.remove('open'); return; }
                    activePetId = petId;
                    localStorage.setItem('activePetId', activePetId);
                    petProfile = allPets.find(p => p.id === activePetId);
                    localStorage.setItem('petProfile', JSON.stringify(petProfile));
                    container?.classList.remove('open');
                    loadPetData(petId);
                };
            });
        }
    }

    function hydrateProfileUI() {
        if (!petProfile) return;
        const nameElem = document.getElementById('dash-name');
        const welcomeElem = document.getElementById('welcome-pet-name');
        if (nameElem) nameElem.textContent = petProfile.name;
        if (welcomeElem) welcomeElem.textContent = petProfile.name;

        const breedElem = document.getElementById('dash-breed');
        const ageElem = document.getElementById('dash-age');
        const weightElem = document.getElementById('dash-weight');
        if (breedElem) breedElem.textContent = petProfile.breed || '-';
        if (ageElem) ageElem.textContent = (petProfile.age || '-') + ' years';
        if (weightElem) weightElem.textContent = petProfile.weight ? `${petProfile.weight} kg` : '-';

        const avatarPreview = document.getElementById('pet-avatar-preview');
        const avatarPlaceholder = document.getElementById('pet-avatar-placeholder');
        if (petProfile.photo_url) {
            if (avatarPreview) { avatarPreview.src = petProfile.photo_url; avatarPreview.style.display = 'block'; }
            if (avatarPlaceholder) avatarPlaceholder.style.display = 'none';
        } else {
            if (avatarPreview) avatarPreview.style.display = 'none';
            if (avatarPlaceholder) avatarPlaceholder.style.display = 'flex';
        }
    }

    // --- PLAN SECTION (PREMIUM ONLY) ---
    function renderPlanSection() {
        const container = document.getElementById('plan-content-area');
        if (!container) return;
        const planNameEl = document.getElementById('current-plan-name');
        if (planNameEl) planNameEl.textContent = 'AI+';
        container.innerHTML = `
            <div class="plan-state-premium transition-fade">
                <div class="plan-info-pill"><div><div class="plan-label">Current Plan</div><div class="plan-name">DailyPaw AI+</div></div></div>
                <div class="premium-active-badge"><span>Active Subscription</span><span class="premium-check-icon">✓</span></div>
                <div class="billing-info"><p>Status: <span style="color: #10B981; font-weight: 600;">Renews automatically</span></p></div>
                <button class="cancel-subscription-link" onclick="handleCancelSubscription()">Cancel Subscription</button>
            </div>`;
    }

    // Premium-only: all features always allowed
    async function checkFeatureLimit(feature) {
        return true;
    }
    window.checkFeatureLimit = checkFeatureLimit;

    // --- CORE INITIALIZATION (FAST LOAD) ---
    async function initUserData() {
        try {
            // 1. STRIPE INSTANT VIP (CAPTURA DE RETORNO)
            const urlParams = new URLSearchParams(window.location.search);
            let justUpgraded = false;
            if (urlParams.get('upgrade') === 'success') {
                await window.supabaseClient.from('profiles').update({ is_premium: true }).eq('id', user.id);
                window.history.replaceState({}, document.title, window.location.pathname);
                justUpgraded = true; // FORCE VIP STATE
            }

            // 2. FETCH PROFILE
            const { data: profileData } = await window.supabaseClient.from('profiles').select('*').eq('id', user.id).single();
            userProfile = profileData || { is_premium: false };

            // ⚡ OVERRIDE DATABASE DELAY ⚡
            if (justUpgraded) {
                userProfile.is_premium = true;
            }

            // 🚫 THE HARD PAYWALL (PREMIUM ONLY SAAS) 🚫
            if (!userProfile.is_premium) {
                document.body.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family: 'Inter', sans-serif; background: #FAF8F5; text-align:center; padding: 20px;">
                        <div style="background: #FFFFFF; border-radius: 28px; padding: 48px 36px; max-width: 440px; width: 100%; box-shadow: 0 20px 60px rgba(58, 90, 64, 0.12); border: 2px solid #3A5A40; position: relative;">
                            
                            <div style="position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: #3A5A40; color: #FFFFFF; padding: 6px 20px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.02em;">All-Inclusive</div>
                            
                            <h2 style="font-size: 1.5rem; color: #3A5A40; text-align: left; margin-bottom: 8px;">DailyPaw AI+</h2>
                            
                            <div style="display: flex; align-items: baseline; gap: 12px; margin-bottom: 24px; text-align: left;">
                                <span style="font-size: 1.2rem; color: #6B7B75; text-decoration: line-through;">$16.99</span>
                                <span style="font-size: 3rem; font-weight: 700; color: #1A1F1D;">$12.99</span>
                                <span style="font-size: 1rem; color: #6B7B75;">/ month</span>
                            </div>
                            
                            <p style="text-align: left; color: #6B7B75; line-height: 1.5; margin-bottom: 32px; font-size: 0.95rem;">
                                The ultimate AI-driven health intelligence for your best friend.
                            </p>
                            
                            <ul style="list-style: none; padding: 0; margin: 0 0 40px 0; text-align: left;">
                                <li style="padding: 10px 0; font-size: 0.95rem; font-weight: 700; color: #1A1F1D; border-bottom: 1px solid rgba(0,0,0,0.04); display: flex; align-items: center; gap: 12px;">
                                    <span style="color: #10B981; background: rgba(16,185,129,0.1); border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem;">✓</span> Unlimited AI Chat & Help
                                </li>
                                <li style="padding: 10px 0; font-size: 0.95rem; font-weight: 700; color: #1A1F1D; border-bottom: 1px solid rgba(0,0,0,0.04); display: flex; align-items: center; gap: 12px;">
                                    <span style="color: #10B981; background: rgba(16,185,129,0.1); border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem;">✓</span> Unlimited AI Food Scans
                                </li>
                                <li style="padding: 10px 0; font-size: 0.95rem; font-weight: 700; color: #1A1F1D; border-bottom: 1px solid rgba(0,0,0,0.04); display: flex; align-items: center; gap: 12px;">
                                    <span style="color: #10B981; background: rgba(16,185,129,0.1); border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem;">✓</span> Unlimited Daily Tracking
                                </li>
                                <li style="padding: 10px 0; font-size: 0.95rem; font-weight: 700; color: #1A1F1D; border-bottom: 1px solid rgba(0,0,0,0.04); display: flex; align-items: center; gap: 12px;">
                                    <span style="color: #10B981; background: rgba(16,185,129,0.1); border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem;">✓</span> Weekly Professional Reports
                                </li>
                                <li style="padding: 10px 0; font-size: 0.95rem; font-weight: 700; color: #1A1F1D; border-bottom: 1px solid rgba(0,0,0,0.04); display: flex; align-items: center; gap: 12px;">
                                    <span style="color: #10B981; background: rgba(16,185,129,0.1); border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem;">✓</span> Smart Clinical Guard (Alerts)
                                </li>
                                <li style="padding: 10px 0; font-size: 0.95rem; font-weight: 700; color: #1A1F1D; border-bottom: 1px solid rgba(0,0,0,0.04); display: flex; align-items: center; gap: 12px;">
                                    <span style="color: #10B981; background: rgba(16,185,129,0.1); border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem;">✓</span> Unlimited Pet Registration
                                </li>
                                <li style="padding: 10px 0; font-size: 0.95rem; font-weight: 700; color: #1A1F1D; border-bottom: 1px solid rgba(0,0,0,0.04); display: flex; align-items: center; gap: 12px;">
                                    <span style="color: #10B981; background: rgba(16,185,129,0.1); border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem;">✓</span> Unlimited Task Reminders
                                </li>
                                <li style="padding: 10px 0; font-size: 0.95rem; font-weight: 700; color: #1A1F1D; display: flex; align-items: center; gap: 12px;">
                                    <span style="color: #10B981; background: rgba(16,185,129,0.1); border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem;">✓</span> Advanced Medical Diagnostics
                                </li>
                            </ul>
                            
                            <button id="global-checkout-btn" style="width: 100%; background: #1A1F1D; color: #FFFFFF; border: none; padding: 16px; border-radius: 30px; font-weight: 600; cursor: pointer; font-size: 1rem; transition: transform 0.2s, background 0.2s;">Start AI+ Experience</button>
                            <button id="logout-paywall-btn" style="width: 100%; background: none; border: none; color: #6B7B75; margin-top: 20px; cursor: pointer; font-size: 0.9rem; text-decoration: underline;">Log out</button>
                        </div>
                    </div>
                `;
                
                document.getElementById('global-checkout-btn').addEventListener('click', async function() {
                    this.textContent = "Gerando Checkout Seguro...";
                    this.style.opacity = "0.7";
                    this.disabled = true;
                    try {
                        const response = await fetch(`${API_BASE}/api/create-checkout-session`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: user.id })
                        });
                        const data = await response.json();
                        if (data.url) {
                            window.location.href = data.url;
                        } else {
                            throw new Error("Falha ao gerar link.");
                        }
                    } catch (err) {
                        this.textContent = "Erro. Tente novamente.";
                        this.style.opacity = "1";
                        this.disabled = false;
                    }
                });
                
                document.getElementById('logout-paywall-btn').addEventListener('click', async () => {
                    localStorage.clear();
                    sessionStorage.clear();
                    await window.supabaseClient.auth.signOut();
                    window.location.replace('/index.html');
                });
                return; // CRITICAL: Halts further execution (no dashboard/onboarding loading)
            }

            renderPlanSection();

            // 3. FETCH PETS
            const { data: petData } = await window.supabaseClient.from('pets').select('*').eq('owner_id', user.id);
            allPets = petData || [];

            // 4. ROUTER: Guard Onboarding and Break Infinite Loop
            const isOnboarding = window.location.pathname.includes('onboarding');
            const isPaywall = window.location.pathname.includes('paywall');
            const isAddingNew = urlParams.get('new') === 'true';

            if (isOnboarding) {
                // 1. Fetch fresh pet count purely from Database (Ignore Stale Memory)
                const { data: dbPets } = await window.supabaseClient.from('pets').select('id').eq('owner_id', user.id);
                
                // 2. Break the Loop
                if (dbPets && dbPets.length > 0 && !isAddingNew) {
                    window.location.replace('/dashboard');
                    return; // Halt execution and escape loop
                } else {
                    return; // Render Onboarding UI and do NOT fall through
                }
            }

            if (allPets.length === 0 && !isPaywall) {
                window.location.replace('/onboarding');
                return;
            } else if (allPets.length > 0 && isOnboarding && !isAddingNew) {
                window.location.replace('/dashboard');
                return;
            }
            if (allPets.length === 0) return; // Safety halt

            // 5. SET ACTIVE PET
            if (!activePetId || !allPets.find(p => p.id === activePetId)) {
                activePetId = allPets[0].id;
                localStorage.setItem('activePetId', activePetId);
            }
            petProfile = allPets.find(p => p.id === activePetId);
            localStorage.setItem('petProfile', JSON.stringify(petProfile));

        } catch (error) {
            console.error("Initialization Failed:", error);
        }
    }

    // --- MAIN DATA LOADER ---
    function getStartOfWeek() {
        const now = new Date(); const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now.setDate(diff)); monday.setHours(0, 0, 0, 0);
        return monday.toISOString();
    }

    async function loadPetData(newId = null) {
        window.loadPetData = loadPetData;
        if (newId) {
            activePetId = newId;
            localStorage.setItem('activePetId', activePetId);
            petProfile = allPets.find(p => p.id === activePetId);
            localStorage.setItem('petProfile', JSON.stringify(petProfile));
        }
        if (!petProfile) return;

        // Apply UI visually immediately 
        try { hydratePetSwitcher(); } catch (e) { console.error(e) }
        try { hydrateProfileUI(); } catch (e) { console.error(e) }

        const startOfWeek = getStartOfWeek();
        try {
            const [reminders, scans, dailyLogs, chatLogs] = await Promise.all([
                window.supabaseClient.from('reminders').select('*').eq('pet_id', activePetId).gte('date', startOfWeek),
                window.supabaseClient.from('food_scans').select('*').eq('pet_id', activePetId).gte('created_at', startOfWeek),
                window.supabaseClient.from('daily_logs').select('*').eq('pet_id', activePetId).gte('created_at', startOfWeek).order('created_at', { ascending: false }),
                window.supabaseClient.from('chat_logs').select('*').eq('pet_id', activePetId).gte('created_at', startOfWeek).order('created_at', { ascending: false })
            ]);

            renderReminders(reminders.data || []);
            renderFoodScans(scans.data || []);
            setupDashboardDelegations();

            proactiveHealthGuard(dailyLogs.data || [], chatLogs.data || [], scans.data || [], petProfile);
            autonomousWeeklySummary(reminders.data || [], scans.data || [], dailyLogs.data || [], chatLogs.data || [], petProfile || {});
        } catch (err) {
            console.error("Unified Brain: Harvest failed", err);
        }
    }

    // --- DASHBOARD RENDERERS ---
    async function proactiveHealthGuard(dailyLogs, chatLogs, scans, pet) {
        if (!pet) return;
        const insightBadge = document.getElementById('insight-badge');
        const insightContainer = document.getElementById('insight-container');
        if (!insightBadge || !insightContainer) return;

        const isPremium = userProfile?.is_premium;

        let level = 'stable', badgeText = 'Everything Normal', mainMessage = i18n.health_normal;
        const recentLogs = dailyLogs || [];
        const appetiteTrend = recentLogs.slice(0, 3).map(l => l.appetite);
        const energyTrend = recentLogs.slice(0, 3).map(l => l.energy);
        const isAnorexicTrend = appetiteTrend.length >= 2 && appetiteTrend.every(v => v === 'low');
        const isLethargicTrend = energyTrend.length >= 2 && energyTrend.every(v => v === 'low');

        if (isAnorexicTrend || isLethargicTrend) {
            level = 'advisory'; badgeText = 'Observation Required'; mainMessage = `🔍 Alert: Trend shows ${isAnorexicTrend ? 'decreased appetite' : 'behavioral lethargy'} for over 48h.`;
        } else if (scans && scans.some(s => s.safety_status === 'dangerous')) {
            level = 'advisory'; badgeText = 'Nutritional Warning'; mainMessage = '🔍 Warning: Recently consumed food was flagged as potentially dangerous.';
        }

        const levelClass = level === 'advisory' ? 'warning' : 'success';
        insightBadge.className = `status-pill ${levelClass}`;
        insightBadge.textContent = badgeText.toUpperCase();
        insightContainer.className = `insight-box ${level}`;
        insightContainer.innerHTML = `<p>${mainMessage}</p>`;
    }

    // --- RESTAURAÇÃO DO BANNER DO RELATÓRIO SEMANAL ---
    async function autonomousWeeklySummary(reminders, scans, dailyLogs, chatLogs, petContext) {
        const startOfWeekStr = getStartOfWeek().split('T')[0];
        const reportContainer = document.getElementById('weekly-report-content');
        if (!reportContainer) return;

        try {
            const { data: reports } = await window.supabaseClient.from('weekly_reports').select('*').eq('pet_id', activePetId).eq('week_start', startOfWeekStr).order('created_at', { ascending: false }).limit(1);
            const existingReport = reports && reports.length > 0 ? reports[0] : null;

            if (existingReport) {
                const formattedHtml = existingReport.summary.split('\\n\\n').map(p => `<p class="weekly-report-paragraph" style="margin-bottom: 12px; line-height: 1.6; color: #4A5568;">${p.replace(/\\n/g, '<br>')}</p>`).join('');
                reportContainer.innerHTML = `<div class="ai-report-formatted">${formattedHtml}</div>`;
            } else {
                reportContainer.innerHTML = `
                    <div class="ai-report-placeholder-premium" style="text-align: center; padding: 20px;">
                        <p style="color: #6B7280; font-size: 0.9rem; margin-bottom: 12px;">${i18n.report_placeholder}</p>
                        <button id="generate-report-btn" class="btn-ai-premium" style="background: linear-gradient(135deg, #2563eb, #4f46e5); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer;">
                            ${i18n.generate_report}
                        </button>
                    </div>
                `;
            }
        } catch (err) {
            console.error("Weekly report error", err);
        }
    }

    function renderReminders(data) {
        const rc = document.getElementById('reminders-container');
        if (!rc) return;
        rc.innerHTML = data.length === 0 ? '<li class="empty-state">No upcoming reminders.</li>' : data.map(rem => {
            const displayDate = new Date(rem.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
            const typeIcon = rem.type === 'vaccine' ? '💉' : (rem.type === 'bath' ? '🛁' : (rem.type === 'medicine' ? '💊' : '🗓️'));
            return `<li><div class="reminder-info"><div style="display:flex; align-items:center; gap:16px;"><div class="reminder-icon-wrapper" style="font-size:1.4rem; background: rgba(58, 90, 64, 0.05); padding: 8px; border-radius: 12px; min-width: 44px; text-align: center;">${typeIcon}</div><div><strong style="font-size: 1.05rem; color: var(--text-color); margin-bottom: 2px; display: block;">${rem.title}</strong><div style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #8C9993;"><span style="display: flex; align-items: center; gap: 4px;">📅 ${displayDate}</span></div></div></div><div style="display:flex; align-items:center; gap:12px;"><button class="delete-reminder-btn" data-id="${rem.id}" title="Remove reminder" style="background: none; border: none; cursor: pointer; padding: 8px; border-radius: 50%; transition: background 0.2s;">🗑️</button></div></div></li>`;
        }).join('');
    }

    function renderFoodScans(data) {
        const fsh = document.getElementById('food-scan-history');
        if (!fsh) return;
        fsh.innerHTML = data.length === 0 ? '<li class="empty-state">No food analysis yet.</li>' : data.slice(0, 5).map(scan => {
            const displayDate = new Date(scan.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return `<li data-id="${scan.id}"><div class="reminder-info" style="align-items:flex-start;"><div style="flex:1;"><strong style="display:block; text-transform:capitalize;">${scan.detected_food}</strong><span style="font-size:0.8rem; color:#8C9993;">${scan.analysis_text}</span></div><div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;"><span class="badge info">${displayDate}</span><button class="delete-scan-btn" data-id="${scan.id}" title="Delete analysis">🗑️</button></div></div></li>`;
        }).join('');
    }

    function setupDashboardDelegations() {
        const rc = document.getElementById('reminders-container');
        const fsh = document.getElementById('food-scan-history');
        if (rc) {
            rc.onclick = async (e) => {
                const btn = e.target.closest('.delete-reminder-btn');
                if (!btn) return;
                const reminderId = btn.getAttribute('data-id');
                const listItem = btn.closest('li');
                try {
                    listItem.style.opacity = '0.3'; listItem.style.pointerEvents = 'none';
                    await window.supabaseClient.from('reminders').delete().eq('id', reminderId);
                    listItem.remove();
                    if (rc.querySelectorAll('li').length === 0) rc.innerHTML = '<li class="empty-state">No reminders logged.</li>';
                } catch (err) { listItem.style.opacity = '1'; listItem.style.pointerEvents = 'all'; }
            };
        }
        if (fsh) {
            fsh.onclick = async (e) => {
                const btn = e.target.closest('.delete-scan-btn');
                if (!btn) return;
                const scanId = btn.getAttribute('data-id');
                const listItem = btn.closest('li');
                try {
                    listItem.style.opacity = '0.3'; listItem.style.pointerEvents = 'none';
                    await window.supabaseClient.from('food_scans').delete().eq('id', scanId);
                    listItem.remove();
                    if (fsh.querySelectorAll('li').length === 0) fsh.innerHTML = '<li class="empty-state">No food analysis yet.</li>';
                } catch (err) { listItem.style.opacity = '1'; listItem.style.pointerEvents = 'all'; }
            };
        }
    }

    // ==========================================
    // EXECUTION FLOW (DASHBOARD ONLY)
    // ==========================================
    if (window.location.pathname.includes('dashboard')) {
        await initUserData();
        if (!petProfile) return;
        await loadPetData();

        // Modal Handlers
        window.openAppModal = function (modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                if (modalId === 'update-profile-modal' && petProfile) {
                    const fields = { 'edit-pet-name': petProfile.name, 'edit-pet-species': petProfile.species, 'edit-pet-breed': petProfile.breed, 'edit-pet-age': petProfile.age, 'edit-pet-weight': petProfile.weight };
                    for (const [id, val] of Object.entries(fields)) { const el = document.getElementById(id); if (el) el.value = val || ''; }
                    const currentActivity = petProfile.activity || 'moderate';
                    document.querySelectorAll('#edit-activity-cards .activity-card').forEach(card => { card.classList.toggle('selected', card.dataset.value === currentActivity); });
                }
                modal.classList.add('active');
                if (modalId === 'food-scanner-modal') resetScannerModal();
                modal.setAttribute('tabindex', '-1'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('role', 'dialog');
                setTimeout(() => modal.focus(), 100);
                document.body.style.overflow = 'hidden';
            }
        };

        window.closeAppModal = function (modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('active');
                if (modalId === 'food-scanner-modal') resetScannerModal();
                modal.removeAttribute('aria-modal'); modal.removeAttribute('role');
                document.body.style.overflow = '';
            }
        };

        window.addEventListener('click', (e) => { if (e.target.classList.contains('auth-modal-overlay')) closeAppModal(e.target.id); });

        // Add Pet Action (Top Card)
        const addPetBtn = document.getElementById('add-pet-action');
        if (addPetBtn) {
            addPetBtn.onclick = async (e) => {
                e.preventDefault();
                const allowed = await checkFeatureLimit('PET_REGISTRATION');
                if (allowed) window.location.href = '/onboarding?new=true';
            };
        }

        // Daily Tracking
        let currentDailyStatus = { energy: null, appetite: null, mood: null };
        document.querySelectorAll('.tracking-option').forEach(btn => {
            btn.addEventListener('click', function () {
                const category = this.dataset.category;
                const value = this.dataset.value;
                this.parentElement.querySelectorAll('.tracking-option').forEach(sibling => sibling.classList.remove('active'));
                this.classList.add('active');
                currentDailyStatus[category] = value;
            });
        });

        const saveTrackingBtn = document.getElementById('save-tracking-btn');
        if (saveTrackingBtn) {
            saveTrackingBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                if (!currentDailyStatus.energy || !currentDailyStatus.appetite || !currentDailyStatus.mood) { alert("Please select Energy, Appetite, and Mood for today."); return; }
                const originalText = saveTrackingBtn.textContent;
                saveTrackingBtn.disabled = true; saveTrackingBtn.textContent = 'Saving...';
                try {
                    await window.supabaseClient.from('daily_logs').insert([{ user_id: user.id, pet_id: activePetId, energy: currentDailyStatus.energy, appetite: currentDailyStatus.appetite, mood: currentDailyStatus.mood }]);
                    saveTrackingBtn.textContent = 'Saved Successfully!';
                    if (typeof confetti === 'function') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                    loadPetData();
                } catch (err) {
                    alert("Failed to save: " + err.message);
                    saveTrackingBtn.disabled = false; saveTrackingBtn.textContent = originalText;
                }
            });
        }

        // Profile Update Form
        const activityCardsContainer = document.getElementById('edit-activity-cards');
        if (activityCardsContainer) {
            activityCardsContainer.addEventListener('click', (e) => {
                const card = e.target.closest('.activity-card');
                if (card) { activityCardsContainer.querySelectorAll('.activity-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); }
            });
        }

        const updateProfileForm = document.getElementById('update-profile-form');
        if (updateProfileForm) {
            updateProfileForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = updateProfileForm.querySelector('button[type="submit"]');
                const origText = btn.textContent; btn.textContent = 'Saving...'; btn.disabled = true;
                const selectedCard = document.querySelector('#edit-activity-cards .activity-card.selected');
                const updatedData = {
                    name: document.getElementById('edit-pet-name').value,
                    species: document.getElementById('edit-pet-species').value,
                    breed: document.getElementById('edit-pet-breed').value,
                    age: parseInt(document.getElementById('edit-pet-age').value),
                    weight: document.getElementById('edit-pet-weight').value,
                    activity: selectedCard ? selectedCard.dataset.value : (petProfile.activity || 'moderate')
                };
                try {
                    await window.supabaseClient.from('pets').update(updatedData).eq('id', petProfile.id);
                    petProfile = { ...petProfile, ...updatedData };
                    localStorage.setItem('petProfile', JSON.stringify(petProfile));
                    hydrateProfileUI();
                    btn.textContent = i18n.saved;
                    setTimeout(() => { closeAppModal('update-profile-modal'); btn.textContent = origText; btn.disabled = false; }, 600);
                } catch (err) { alert("Failed to update profile."); btn.textContent = origText; btn.disabled = false; }
            });
        }

        // Health Insights Button
        const btnHealthInsights = document.getElementById('btn-health-insights');
        if (btnHealthInsights) {
            btnHealthInsights.addEventListener('click', async (e) => {
                const isAuthorized = await checkFeatureLimit('AI_INSIGHTS');
                if (!isAuthorized) return;
                const modalContainer = document.getElementById('health-insights-content');
                openAppModal('health-insights-modal');
                modalContainer.innerHTML = `<p><strong>Smart Health Guard Active</strong></p><p>Syncing with veterinary protocols...</p>`;
                try {
                    const response = await fetch(`${API_BASE}/api/health-synthesis`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ petData: petProfile, logs: [], scans: [] })
                    });
                    if (response.ok) {
                        const result = await response.json();
                        const aiText = result.message || result.insight || result.text;
                        if (aiText) {
                            modalContainer.innerHTML = `<strong>Clinical Observer Synthesis:</strong> ${aiText}`;
                        }
                    }
                } catch (e) { modalContainer.innerHTML = "Analysis failed."; }
            });
        }

        // Reminders
        const reminderTypeGrid = document.getElementById('reminder-type-grid');
        const remTypeInput = document.getElementById('rem-type');
        if (reminderTypeGrid && remTypeInput) {
            reminderTypeGrid.addEventListener('click', (e) => {
                const card = e.target.closest('.rem-type-card');
                if (!card) return;
                reminderTypeGrid.querySelectorAll('.rem-type-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected'); remTypeInput.value = card.dataset.value;
            });
        }

        const reminderForm = document.getElementById('add-reminder-form');
        const saveReminderBtn = document.getElementById('save-reminder-btn');
        if (reminderForm && saveReminderBtn) {
            reminderForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const title = document.getElementById('rem-title').value.trim();
                const date = document.getElementById('rem-date').value;
                if (!title || !date) { alert("Please provide Title and Date."); return; }
                const isAllowed = await checkFeatureLimit('REMINDERS');
                if (!isAllowed) return;

                const originalText = saveReminderBtn.textContent;
                saveReminderBtn.textContent = 'Saving...'; saveReminderBtn.disabled = true;
                try {
                    await window.supabaseClient.from('reminders').insert([{ user_id: user.id, pet_id: activePetId, title, type: document.getElementById('rem-type').value, date, status: 'pending' }]);
                    loadPetData();
                    setTimeout(() => {
                        closeAppModal('add-reminder-modal'); reminderForm.reset();
                        if (reminderTypeGrid) { reminderTypeGrid.querySelectorAll('.rem-type-card').forEach(c => c.classList.remove('selected')); const defaultCard = reminderTypeGrid.querySelector('[data-value="vaccine"]'); if (defaultCard) defaultCard.classList.add('selected'); }
                        if (remTypeInput) remTypeInput.value = 'vaccine';
                        saveReminderBtn.textContent = originalText; saveReminderBtn.disabled = false;
                    }, 600);
                } catch (err) { alert("Failed to save."); saveReminderBtn.textContent = originalText; saveReminderBtn.disabled = false; }
            });
        }

        // --- RESTAURAÇÃO DO BANNER NO BOTÃO DE GERAR RELATÓRIO ---
        document.addEventListener('click', async (e) => {
            if (e.target && e.target.id === 'generate-report-btn') {
                const btn = e.target;
                btn.disabled = true;
                btn.innerHTML = `<span>⏳</span> ${i18n.analyzing}`;
                try {
                    const logs = await window.supabaseClient.from('daily_logs').select('*').eq('pet_id', activePetId).limit(7);
                    const scansData = await window.supabaseClient.from('food_scans').select('*').eq('pet_id', activePetId).limit(5);
                    const response = await fetch(`${API_BASE}/api/generate-weekly-report`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: user.id, petContext: petProfile, logs: logs.data || [], scans: scansData.data || [], chatHistory: getChatHistory() })
                    });
                    if (response.ok) {
                        const data = await response.json();
                        const reportContainer = document.getElementById('weekly-report-content');
                        if (reportContainer) {
                            // Normalize newlines (in case of double escaped strings) and split into paragraphs
                            const normalizedText = data.summary.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n'); 
                            const formattedHtml = normalizedText.split('\n\n').map(p => `<p class="weekly-report-paragraph" style="margin-bottom: 12px; line-height: 1.6; color: #4A5568;">${p.replace(/\n/g, '<br>')}</p>`).join('');
                            reportContainer.innerHTML = `<div class="ai-report-formatted">${formattedHtml}</div>`;
                        }
                        // Save so it loads automatically next time
                        const startOfWeekStr = getStartOfWeek().split('T')[0];
                        await window.supabaseClient.from('weekly_reports').upsert([{ pet_id: activePetId, user_id: user.id, week_start: startOfWeekStr, summary: data.summary }], { onConflict: 'pet_id, week_start' });
                    } else {
                        btn.innerHTML = "Error generating. Try Again.";
                        btn.disabled = false;
                    }
                } catch (err) {
                    btn.innerHTML = "Network Error. Try Again.";
                    btn.disabled = false;
                }
            }
        });

        // Food Scanner Logic
        const scanFoodBtn = document.getElementById('scan-food-btn');
        const cameraInput = document.getElementById('camera-input');
        const scannerPreview = document.getElementById('scanner-preview-container');
        const previewImg = document.getElementById('scanner-preview-img');
        const foodResult = document.getElementById('food-scan-result-container');
        const retakeBtn = document.getElementById('retake-btn');
        const contextContainer = document.getElementById('food-scanner-context-container');
        const contextInput = document.getElementById('food-context-input');
        const analyzeFinalBtn = document.getElementById('analyze-food-final-btn');
        window.currentCapturedFile = null;

        const resizeImageIfNeeded = async (file) => {
            const MAX_BYTES = 4 * 1024 * 1024;
            if (file.size <= MAX_BYTES) return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.readAsDataURL(file); });
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas'), MAX_DIM = 1600;
                        let w = img.width, h = img.height;
                        if (w > h) { if (w > MAX_DIM) { h *= MAX_DIM / w; w = MAX_DIM; } } else { if (h > MAX_DIM) { w *= MAX_DIM / h; h = MAX_DIM; } }
                        canvas.width = w; canvas.height = h;
                        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
        };

        if (scanFoodBtn && cameraInput) {
            scanFoodBtn.addEventListener('click', async () => { const allowed = await checkFeatureLimit('FOOD_SCAN'); if (allowed) cameraInput.click(); });
            if (retakeBtn) retakeBtn.addEventListener('click', () => cameraInput.click());
            cameraInput.addEventListener('change', (e) => {
                const file = e.target.files[0]; if (!file) return; window.currentCapturedFile = file;
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (previewImg) previewImg.src = event.target.result;
                    if (scannerPreview) scannerPreview.style.display = 'block';
                    if (contextContainer) contextContainer.style.display = 'block';
                    if (foodResult) foodResult.style.display = 'none';
                    if (scanFoodBtn) scanFoodBtn.style.display = 'none';
                };
                reader.readAsDataURL(file);
            });
            if (analyzeFinalBtn) {
                analyzeFinalBtn.onclick = async () => {
                    if (analyzeFinalBtn.disabled) return;
                    const file = window.currentCapturedFile;
                    if (!file) { alert("Please select or take a photo first."); return; }
                    const isAllowed = await checkFeatureLimit('FOOD_SCAN'); if (!isAllowed) return;
                    analyzeFinalBtn.disabled = true; analyzeFinalBtn.innerHTML = `<span>⏳</span> ${i18n.analyzing}`;
                    try {
                        const base64Content = await resizeImageIfNeeded(file);
                        const response = await fetch(`${API_BASE}/api/analyze`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ image: base64Content, mimeType: file.type || "image/jpeg", userProvidedDetails: contextInput ? contextInput.value : '', userId: user.id, petData: petProfile })
                        });
                        if (!response.ok) throw new Error("HTTP Error");
                        const analysis = await response.json();

                        if (foodResult) {
                            const foodInfo = analysis.food_analysis;
                            const suitability = analysis.nutritional_suitability_for_this_pet;
                            const macros = analysis.macros_estimated;

                            foodResult.innerHTML = `
                                <div class="result-card" style="padding:16px; border-radius:12px; background:#f8faff; border: 1px solid #e0e6ed;">
                                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                        <div style="max-width: 70%;">
                                            <strong style="font-size:1.1rem; display:block;">${foodInfo.identified_food_type}</strong>
                                            <small style="color:#8C9993;">${foodInfo.verified_details}</small>
                                        </div>
                                        <span class="badge" style="background:${suitability.status === 'RISKY' || suitability.status === 'TOXIC' ? '#ff4d4d' : '#47d78a'}; color:white; padding:4px 8px; border-radius:6px; font-size:0.75rem;">${(suitability.badge_text || suitability.status).toUpperCase()}</span>
                                    </div>
                                    <div style="display:flex; gap:12px; margin-top:20px; text-align:center;">
                                        <div style="flex:1;"><small style="display:block; color:#8C9993;">Energy (kcal)</small><strong>${macros.estimated_metabolizable_energy_kcal}</strong></div>
                                        <div style="flex:1;"><small style="display:block; color:#8C9993;">Protein</small><strong>${macros.protein_percent}%</strong></div>
                                        <div style="flex:1;"><small style="display:block; color:#8C9993;">Fat</small><strong>${macros.fat_percent}%</strong></div>
                                    </div>
                                    <div style="margin-top:20px; padding-top:16px; border-top: 1px solid #eee;">
                                        <p style="font-size:0.85rem; line-height:1.6; color:#2D3632; margin:0;">
                                            <strong>Veterinary Report:</strong> ${suitability.personalized_veterinary_summary}
                                        </p>
                                    </div>
                                </div>
                            `;
                            foodResult.style.display = 'block';
                        }
                        if (contextContainer) contextContainer.style.display = 'none';

                        await window.supabaseClient.from('food_scans').insert([{ user_id: user.id, pet_id: petProfile.id, detected_food: analysis.food_analysis.identified_food_type, safety_status: analysis.nutritional_suitability_for_this_pet.status, analysis_text: analysis.nutritional_suitability_for_this_pet.personalized_veterinary_summary, analysis_json: analysis }]);
                        loadPetData();
                        analyzeFinalBtn.innerHTML = `<span>✅</span> Complete`;
                    } catch (err) { alert("Failed to analyze."); analyzeFinalBtn.disabled = false; analyzeFinalBtn.innerHTML = `<span>🔄</span> Try Again`; }
                };
            }
        }

        // Plan Handlers
        const trigger = document.getElementById('plan-pill-trigger');
        const manager = document.getElementById('plan-pill-manager');
        if (trigger && manager) {
            trigger.addEventListener('click', (e) => { e.stopPropagation(); manager.classList.toggle('open'); });
            document.addEventListener('click', (e) => { if (!manager.contains(e.target)) manager.classList.remove('open'); });
        }

        window.handleUpgrade = () => {
            window.location.href = `https://buy.stripe.com/test_14A3cucDceUU8UE2Hm5c400?client_reference_id=${user.id}`;
        };

        window.handleCancelSubscription = async () => {
            if (!confirm("Are you sure you want to cancel your AI+ subscription?")) return;
            try {
                await window.supabaseClient.from('profiles').update({ is_premium: false }).eq('id', user.id);
                alert("Subscription cancelled. You will be redirected.");
                window.location.reload(); // Reload triggers the hard paywall
            } catch (err) { alert("Cancellation failed."); }
        };

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', async () => { 
            localStorage.clear(); 
            sessionStorage.clear();
            await window.supabaseClient.auth.signOut(); 
            window.location.replace('/index.html'); 
        });

        document.querySelectorAll('.dashboard-card').forEach((card, index) => {
            card.style.opacity = 0; card.style.animation = `fadeInUp 0.6s cubic-bezier(0.165, 0.84, 0.44, 1) forwards ${index * 0.1}s`;
        });
    }
});

const style = document.createElement('style');
style.textContent = `@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`;
document.head.appendChild(style);

// ============================================================
// AI CHAT
// ============================================================
const CHAT_STORAGE_KEY = 'dailypaw_chat_history';
function getChatHistory() { try { return JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY)) || []; } catch { return []; } }
function saveChatHistory(history) { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history)); }
function getTimeString() { return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
function renderMarkdown(text) { if (!text) return ""; let r = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); r = r.replace(/\*(.*?)\*/g, '<em>$1</em>'); return r.replace(/\s\*\s/g, ' '); }

function renderChatHistory() {
    const container = document.getElementById('chat-messages'); if (!container) return;
    const history = getChatHistory();
    container.innerHTML = `<div class="chat-bubble ai"><p>Hello! 🐾 I'm your DailyPaw Veterinary Assistant. How can I help your pet today?</p><span class="chat-time">Now</span></div>`;
    history.forEach(msg => {
        const bubble = document.createElement('div'); bubble.className = `chat-bubble ${msg.role}`;
        bubble.innerHTML = `<p>${renderMarkdown(msg.text)}</p><span class="chat-time">${msg.time}</span>`; bubble.style.animation = 'none';
        container.appendChild(bubble);
    });
    container.scrollTop = container.scrollHeight;
}

function toggleAIChat() {
    const chatWindow = document.getElementById('ai-chat-window'), fab = document.getElementById('ai-chat-fab');
    if (!chatWindow || !fab) return;
    if (chatWindow.style.display !== 'none') { chatWindow.style.display = 'none'; fab.classList.remove('open'); }
    else { chatWindow.style.display = 'flex'; fab.classList.add('open'); renderChatHistory(); setTimeout(() => document.getElementById('chat-input')?.focus(), 100); }
}

function clearAIChat() { localStorage.removeItem(CHAT_STORAGE_KEY); renderChatHistory(); }

async function sendAIChatMessage() {
    const input = document.getElementById('chat-input'), sendBtn = document.getElementById('chat-send-btn'), container = document.getElementById('chat-messages');
    if (!input || !container) return;
    const message = input.value.trim(); if (!message) return;

    const isAllowed = await window.checkFeatureLimit('AI_CHAT'); if (!isAllowed) return;

    input.value = ''; input.disabled = true; sendBtn.disabled = true;
    const time = getTimeString(), userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user'; userBubble.innerHTML = `<p>${renderMarkdown(message)}</p><span class="chat-time">${time}</span>`; container.appendChild(userBubble);

    const history = getChatHistory(); history.push({ role: 'user', text: message, time }); saveChatHistory(history);
    if (typeof activePetId !== 'undefined' && window.supabaseClient) { window.supabaseClient.from('chat_logs').insert([{ pet_id: activePetId, user_id: user.id, role: 'user', message: message }]).then(() => { if (typeof window.loadPetData === 'function') window.loadPetData(); }); }

    const typing = document.createElement('div'); typing.className = 'chat-typing'; typing.id = 'chat-typing-indicator'; typing.innerHTML = '<span></span><span></span><span></span>'; container.appendChild(typing); container.scrollTop = container.scrollHeight;

    try {
        const response = await fetch(`${API_BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, context: 'DailyPaw Vet AI', userId: user?.id }) });
        document.getElementById('chat-typing-indicator')?.remove();
        if (!response.ok) throw new Error('Chat failed');
        const data = await response.json(), aiTime = getTimeString(), reply = data.reply || "Sorry, I couldn't process your message.";
        const aiBubble = document.createElement('div'); aiBubble.className = 'chat-bubble ai'; aiBubble.innerHTML = `<p>${renderMarkdown(reply)}</p><span class="chat-time">${aiTime}</span>`; container.appendChild(aiBubble); container.scrollTop = container.scrollHeight;
        history.push({ role: 'ai', text: reply, time: aiTime }); saveChatHistory(history);
        if (typeof activePetId !== 'undefined' && window.supabaseClient) { await window.supabaseClient.from('chat_logs').insert([{ pet_id: activePetId, user_id: user.id, role: 'ai', message: reply }]); }
    } catch (err) {
        document.getElementById('chat-typing-indicator')?.remove();
        const errorBubble = document.createElement('div'); errorBubble.className = 'chat-bubble ai'; errorBubble.innerHTML = `<p>Connection error.</p><span class="chat-time">${getTimeString()}</span>`; container.appendChild(errorBubble); container.scrollTop = container.scrollHeight;
    } finally { input.disabled = false; sendBtn.disabled = false; input.focus(); }
}

document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'chat-input') { e.preventDefault(); sendAIChatMessage(); } });