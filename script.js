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

// --- Auth Redirect Guard ---
// Prevents the onAuthStateChange listener from double-redirecting when
// the login form handler has already initiated a redirect.
let _authRedirectInProgress = false;

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
            const checkoutLink = trigger.getAttribute('data-checkout-link');

            if (plan) {
                localStorage.setItem('selectedPlan', plan);
                console.log(`DailyPaw Auth: Plan '${plan}' captured via direct click.`);
            }
            if (checkoutLink) {
                localStorage.setItem('selectedCheckoutLink', checkoutLink);
                console.log(`DailyPaw Auth: Checkout link captured -> ${checkoutLink}`);
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
                    redirectTo: window.location.origin + '/paywall.html',
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

                // Set guard BEFORE any redirect to block onAuthStateChange from competing
                _authRedirectInProgress = true;

                console.log("[AUTH] Acesso Garantido! Redirecionando...");
                btn.style.backgroundColor = "#10B981";
                btn.style.color = "#ffffff";
                btn.textContent = 'Success!';

                // Redirect immediately — no setTimeout race condition
                window.location.href = '/dashboard';

            } else {
                console.log("[AUTH] Chamando servidor de Cadastro...");
                const nameInput = document.getElementById('signup-name');
                const fullName = nameInput ? nameInput.value : 'Tutor';

                const { data, error } = await window.supabaseClient.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { full_name: fullName },
                        emailRedirectTo: window.location.origin + '/paywall.html'
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
    const defaultLink = 'https://buy.stripe.com/fZu3cueMW1hU7ur7ltbAs02';
    const checkoutLink = localStorage.getItem('selectedCheckoutLink') || defaultLink;
    window.location.href = `${checkoutLink}?client_reference_id=${window.pendingUserId}`;
};

// --- Global Auth Listener (Cross-Tab Sync & OAuth) ---
// This listener handles:
//   1. Cross-tab login sync (e.g., user confirms email in another tab)
//   2. OAuth callback redirects (Google Sign-In)
// It must NOT interfere with the manual login/signup form handlers above.
window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log(`[AUTH] Evento detectado: ${event}`);

    // GUARD: If the login form handler already initiated a redirect, do nothing.
    // This prevents the double-redirect race condition that caused infinite refreshes.
    if (_authRedirectInProgress) {
        console.log('[AUTH] Redirect already in progress (login form). Skipping listener.');
        return;
    }

    // Only act on SIGNED_IN from external sources (OAuth, cross-tab, email verification).
    // Ignore INITIAL_SESSION (fires on every page load if a session cookie exists)
    // and TOKEN_REFRESHED (routine background token maintenance).
    if (event !== 'SIGNED_IN') {
        return;
    }

    // Only redirect from guest pages (landing, signup). Never from dashboard/onboarding.
    const path = window.location.pathname;
    const isGuestPage = path.endsWith('index.html') || path === '/' || path.includes('/signup');
    if (!isGuestPage) {
        return;
    }

    if (!session) return;

    console.log("[AUTH] Sessão detectada (Cross-Tab Sync ou OAuth).");
    _authRedirectInProgress = true; // Prevent any further listener triggers

    // Handle OAuth token fragment cleanup
    if (window.location.hash.includes('access_token')) {
        window.history.replaceState(null, null, ' ');
    }

    try {
        const { data: profile } = await window.supabaseClient
            .from('profiles')
            .select('is_premium')
            .eq('id', session.user.id)
            .single();

        if (profile?.is_premium) {
            // Do not force redirect if the user is in the middle of the paywall flow
            if (!window.location.pathname.includes('paywall')) {
                window.location.href = '/dashboard';
            }
        } else {
            window.location.href = '/paywall.html';
        }
    } catch (e) {
        console.error('[AUTH] Profile check failed, defaulting to dashboard:', e);
        if (!window.location.pathname.includes('paywall')) {
            window.location.href = '/dashboard';
        }
    }
});