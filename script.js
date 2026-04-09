// --- Prevent Automatic Scrolling on Load ---
// This guarantees the user always starts at the Hero section.
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

// Force immediate scroll to top before the browser even tries to jump
window.scrollTo(0, 0);
window.addEventListener('beforeunload', () => {
    window.scrollTo(0, 0);
});

document.addEventListener('DOMContentLoaded', () => {
    // Redundant safeguard to ensure we stay at the top once the DOM is ready
    window.scrollTo(0, 0);

    // --- Premium Smooth Scrolling for Navigation Links ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return; // Ignore empty hashes

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // --- Intersection Observers for Premium Scroll Animations ---
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1 // Wait until element is 10% visible
    };

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                // Unobserve to keep it visible once revealed
                revealObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe all reveal elements
    document.querySelectorAll('.reveal, .reveal-stagger').forEach(el => {
        revealObserver.observe(el);
    });

    // --- Navbar Scroll Effect ---
    const navbar = document.querySelector('.navbar');
    const handleNavbarScroll = () => {
        if (window.scrollY > 20) {
            navbar.classList.add('navbar-scrolled');
        } else {
            navbar.classList.remove('navbar-scrolled');
        }
    };

    window.addEventListener('scroll', handleNavbarScroll);
    // Run once on load in case page starts scrolled
    handleNavbarScroll();
});

// --- Dynamic Checkout & Plan State ---
let selectedPlan = 'premium'; // Premium-only SaaS

// --- Authentication Modal Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('auth-modal');
    if (!authModal) return;

    const closeBtn = document.querySelector('.modal-close-btn');
    const authTriggers = document.querySelectorAll('[data-auth]');
    const signupFormContainer = document.getElementById('signup-form');
    const loginFormContainer = document.getElementById('login-form');

    // Open Modal
    authTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const mode = trigger.getAttribute('data-auth');
            const plan = trigger.getAttribute('data-plan');

            if (plan) {
                localStorage.setItem('selectedPlan', plan);
                console.log(`DailyPaw Auth: Plan '${plan}' captured via direct click.`);
            }

            switchAuthMode(mode);
            authModal.classList.add('active');
            document.body.style.overflow = 'hidden'; // prevent background scroll
        });
    });

    // Close Modal
    const closeModal = () => {
        authModal.classList.remove('active');
        document.body.style.overflow = '';
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    authModal.addEventListener('click', (e) => {
        if (e.target === authModal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && authModal.classList.contains('active')) {
            closeModal();
        }
    });

    // --- Dynamic URL Parameter Handling for /signup ---
    const handleUrlParams = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const plan = urlParams.get('plan');
        const isSignupPath = window.location.pathname.includes('/signup');

        if (plan) {
            selectedPlan = plan;
            localStorage.setItem('selectedPlan', plan);
            console.log(`DailyPaw Onboarding: Detected selected plan -> ${selectedPlan} (Persisted)`);
        } else {
            const savedPlan = localStorage.getItem('selectedPlan');
            if (savedPlan) {
                selectedPlan = savedPlan;
            }
        }

        if (isSignupPath) {
            switchAuthMode('signup');
            authModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    };
    handleUrlParams();

    // Switch Auth Forms
    window.switchAuthMode = (mode) => {
        const pendingView = document.getElementById('email-pending-view');
        const paywallView = document.getElementById('email-confirmed-paywall-view');
        const authModalOverlay = document.getElementById('auth-modal-overlay');

        signupFormContainer.classList.remove('active');
        loginFormContainer.classList.remove('active');
        if (pendingView) pendingView.classList.remove('active');
        if (paywallView) paywallView.classList.remove('active');

        if (mode === 'login') {
            loginFormContainer.classList.add('active');
        } else if (mode === 'signup') {
            signupFormContainer.classList.add('active');
        } else if (mode === 'email-pending') {
            if (pendingView) pendingView.classList.add('active');
        } else if (mode === 'email-confirmed-paywall-view') {
            if (paywallView) paywallView.classList.add('active');
        }

        // Ensure the modal itself is open
        if (authModalOverlay) {
            authModalOverlay.classList.add('active');
        }

        // Clear old errors on switch
        document.querySelectorAll('.form-group').forEach(fg => fg.classList.remove('error'));
        document.querySelectorAll('.auth-form').forEach(f => f.reset());
        const signupErr = document.getElementById('signup-error-block');
        const loginErr = document.getElementById('login-error-block');
        if (signupErr) signupErr.style.display = 'none';
        if (loginErr) loginErr.style.display = 'none';
    };

    // Google OAuth Handler
    window.signInWithGoogle = async () => {
        try {
            console.log("Supabase Auth: Triggering Google OAuth Flow...");
            const { error } = await window.supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + '/dashboard.html',
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    }
                }
            });
            if (error) throw error;
        } catch (error) {
            console.error("Supabase Auth: Google logic failed:", error.message);
            alert("Google Sign-In is temporary unavailable. Please use email/password.");
        }
    };

    // Professional Event Attachment for Social Login
    const googleBtns = document.querySelectorAll('.google-btn');
    googleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            window.signInWithGoogle();
        });
    });

    // Form Submission (Versão Blindada e Simplificada)
    // --- Form Submission (Blindado e com Debug Visual) ---
    window.handleAuthSubmit = async (e, mode) => {
        e.preventDefault(); // Impede a página de recarregar
        console.log(`[AUTH] Iniciando fluxo de: ${mode}`);

        const btn = e.target.querySelector('button[type="submit"]') || e.target.querySelector('button');
        if (btn.disabled) return; // Trava contra duplo-clique instantâneo

        const originalText = btn.innerHTML; // Salva o HTML original (com os ícones)
        btn.innerHTML = 'Processing...';
        btn.disabled = true;
        btn.style.transition = "all 0.3s ease"; // Suaviza as trocas de cor

        try {
            const emailInput = document.getElementById(`${mode}-email`);
            const passwordInput = document.getElementById(`${mode}-password`);

            // Validação de segurança primária
            if (!emailInput || !passwordInput) {
                throw new Error(`Inputs de ${mode} não encontrados no HTML.`);
            }

            const email = emailInput.value;
            const password = passwordInput.value;
            console.log(`[AUTH] Credenciais capturadas. Tentando comunicação...`);

            if (mode === 'login') {
                console.log("[AUTH] Chamando servidor de Login...");
                const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });

                if (error) throw error;

                console.log("[AUTH] Acesso Garantido! Redirecionando...");
                btn.style.backgroundColor = "#10B981"; // Pinta de Verde
                btn.style.color = "#ffffff";
                btn.textContent = 'Success!';
                setTimeout(() => window.location.href = 'dashboard.html', 500);

            } else {
                console.log("[AUTH] Chamando servidor de Cadastro...");
                const nameInput = document.getElementById('signup-name');
                const fullName = nameInput ? nameInput.value : 'Tutor';

                const { data, error } = await window.supabaseClient.auth.signUp({
                    email,
                    password,
                    options: { 
                        data: { full_name: fullName },
                        emailRedirectTo: window.location.origin + window.location.pathname
                    }
                });

                if (error) throw error;

                console.log("[AUTH] Cadastro iniciado com sucesso! Aguardando confirmação...");
                
                // Save user ID to allow immediate Stripe checkout
                if (data && data.user) {
                    window.pendingUserId = data.user.id;
                }

                // Exibe o estado de "Awaiting Verification"
                const pendingEmailEl = document.getElementById('pending-email-display');
                if (pendingEmailEl) pendingEmailEl.textContent = email;
                
                switchAuthMode('email-pending');
                
                // O botão de sucesso é apenas um feedback rápido antes de trocar a view
                btn.style.backgroundColor = "#10B981";
                btn.style.color = "#ffffff";
                btn.textContent = 'Success!';

            }

        } catch (error) {
            console.error("[AUTH] Ocorreu um Erro Crítico:", error);

            // FEEDBACK VISUAL DIRETO NO BOTÃO (Impossível de não ver)
            btn.style.backgroundColor = "#EF4444"; // Pinta de Vermelho
            btn.style.color = "#ffffff";

            // Traduz erros comuns do Supabase ou mostra o erro real
            if (error.message.includes('Invalid login credentials')) {
                btn.textContent = "E-mail ou senha incorretos";
            } else {
                btn.textContent = error.message || "Erro de conexão";
            }

            // Destranca o botão depois de 3.5 segundos para tentar de novo
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.backgroundColor = ""; // Reseta a cor
                btn.style.color = "";
                btn.disabled = false;
            }, 3500);
        }

        return false;
    };

    // Clear errors instantly while typing
    document.querySelectorAll('.form-group input').forEach(input => {
        input.addEventListener('input', () => {
            input.closest('.form-group').classList.remove('error');
        });
    });
});

// Handle upgrade immediately after signup
window.handlePostSignupUpgrade = () => {
    if (!window.pendingUserId) {
        alert("User ID missing. Try logging in first.");
        return;
    }
    window.location.href = `https://buy.stripe.com/test_14A3cucDceUU8UE2Hm5c400?client_reference_id=${window.pendingUserId}`;
};

// --- Global Auth Listener (Cross-Tab Sync & OAuth) ---
window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log(`[AUTH] Evento detectado: ${event}`);

    // If a session is detected (especially via cross-tab sync or email confirmation)
    if (session) {
        // Narrow the scope to guest pages (landing/signup) to prevent unnecessary redirects on dashboard/onboarding
        const isGuestPage = window.location.pathname.endsWith('index.html') || 
                           window.location.pathname === '/' || 
                           window.location.pathname.includes('/signup');

        if (isGuestPage) {
            // SIGNED_IN is the primary event for cross-tab sync after email verification
            if (event === 'SIGNED_IN') {
                console.log("[AUTH] Sessão detectada (Cross-Tab Sync ou Login).");
                
                // Handle OAuth token cleanup if present
                if (window.location.hash.includes('access_token')) {
                    window.history.replaceState(null, null, ' ');
                }

                try {
                    // Check if user is premium
                    const { data: profile } = await window.supabaseClient.from('profiles').select('is_premium').eq('id', session.user.id).single();
                    
                    if (profile?.is_premium) {
                        window.location.href = '/dashboard';
                    } else {
                        // Ensure window.pendingUserId is set correctly for Stripe checkout
                        window.pendingUserId = session.user.id;
                        // Elegant Paywall Reveal!
                        switchAuthMode('email-confirmed-paywall-view');
                    }
                } catch (e) {
                    window.location.href = '/dashboard';
                }
            }
        }
    }
});