import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/useAuthStore";
import BorderAnimatedContainer from "../components/BorderAnimatedContainer";
import {
  MessageCircleIcon,
  MailIcon,
  LoaderIcon,
  LockIcon,
  ShieldCheckIcon,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react";
import { Link } from "react-router";

function LoginPage() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [resetData, setResetData] = useState({ email: "", newPassword: "", confirmPassword: "" });
  const [showResetForm, setShowResetForm] = useState(false);
  const [showHeroIntro, setShowHeroIntro] = useState(false);
  const { login, isLoggingIn, resetPassword, isResettingPassword } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setShowHeroIntro(true);
      return undefined;
    }

    const timer = window.setTimeout(() => setShowHeroIntro(true), 220);

    return () => window.clearTimeout(timer);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    login(formData);
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (!resetData.email || !resetData.newPassword) {
      toast.error("Please fill in all fields");
      return;
    }
    if (resetData.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (resetData.newPassword !== resetData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    const success = await resetPassword({
      email: resetData.email,
      newPassword: resetData.newPassword,
    });

    if (success) {
      setFormData({ email: resetData.email, password: resetData.newPassword });
      setResetData({ email: "", newPassword: "", confirmPassword: "" });
      setShowResetForm(false);
    }
  };

  return (
    <div className="auth-page-shell w-full flex items-center justify-center bg-slate-900">
      <div className="auth-page-card relative w-full max-w-6xl">
        <BorderAnimatedContainer className="auth-page-surface">
          <div className="w-full h-full flex flex-col md:flex-row">
            {/* FORM CLOUMN - LEFT SIDE */}
            <div className="auth-page-column md:w-1/2 md:border-r border-slate-600/30">
              <div className="w-full max-w-md mx-auto">
                {/* HEADING TEXT */}
                <div className="text-center mb-8 login-hero-stack">
                  <div
                    className={`login-hero-logo ${showHeroIntro ? "login-hero-visible" : "login-hero-hidden"}`}
                  >
                    <MessageCircleIcon className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                  </div>
                  <h2
                    className={`text-2xl font-bold text-slate-200 mb-2 login-hero-title ${showHeroIntro ? "login-hero-visible" : "login-hero-hidden"}`}
                  >
                    Welcome Back
                  </h2>
                  <p
                    className={`text-slate-400 login-hero-subtitle ${showHeroIntro ? "login-hero-visible" : "login-hero-hidden"}`}
                  >
                    Login to access to your account
                  </p>
                </div>

                
                <form onSubmit={handleSubmit} className="space-y-6">
                  
                  <div>
                    <label className="auth-input-label" htmlFor="login-email">
                      Email
                    </label>
                    <div className="relative">
                      <MailIcon className="auth-input-icon" />

                      <input
                        type="email"
                        id="login-email"
                        name="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="input"
                        placeholder="johndoe@gmail.com"
                      />
                    </div>
                  </div>

                  
                  <div>
                    <label className="auth-input-label" htmlFor="login-password">
                      Password
                    </label>
                    <div className="relative">
                      <LockIcon className="auth-input-icon" />
                      <input
                        type={showPassword ? "text" : "password"}
                        id="login-password"
                        name="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="input pr-12"
                        placeholder="Enter your password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeIcon className="w-4 h-4" /> : <EyeOffIcon className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  
                  <button className="auth-btn" type="submit" disabled={isLoggingIn}>
                    {isLoggingIn ? (
                      <LoaderIcon className="w-full h-5 animate-spin text-center" />
                    ) : (
                      "Sign In"
                    )}
                  </button>
                </form>

                <div className="auth-actions mt-8">
                  <button
                    type="button"
                    onClick={() => setShowResetForm((prev) => !prev)}
                    className="auth-action-btn"
                    aria-expanded={showResetForm}
                    aria-controls="reset-password-panel"
                  >
                    <span className="auth-action-icon-wrap">
                      <ShieldCheckIcon className="w-4 h-4" />
                    </span>
                    <span className="auth-action-content">
                      <span className="auth-action-title">Forgot password?</span>
                      <span className="auth-action-subtitle">
                        Create a new one securely
                      </span>
                    </span>
                  </button>

                  {showResetForm && (
                    <form
                      id="reset-password-panel"
                      onSubmit={handleResetSubmit}
                      className="auth-reset-panel"
                    >
                      <div>
                        <label className="auth-input-label" htmlFor="reset-email">
                          Account email
                        </label>
                        <div className="relative">
                          <MailIcon className="auth-input-icon" />
                          <input
                            type="email"
                            id="reset-email"
                            value={resetData.email}
                            onChange={(e) => setResetData({ ...resetData, email: e.target.value })}
                            className="input"
                            placeholder="you@email.com"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="auth-input-label" htmlFor="reset-password">
                            New password
                          </label>
                          <div className="relative">
                            <LockIcon className="auth-input-icon" />
                            <input
                              type={showResetPassword ? "text" : "password"}
                              id="reset-password"
                              value={resetData.newPassword}
                              onChange={(e) =>
                                setResetData({ ...resetData, newPassword: e.target.value })
                              }
                              className="input pr-12"
                              placeholder="At least 6 characters"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowResetPassword((prev) => !prev)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                              aria-label={showResetPassword ? "Hide password" : "Show password"}
                            >
                              {showResetPassword ? (
                                <EyeIcon className="w-4 h-4" />
                              ) : (
                                <EyeOffIcon className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="auth-input-label" htmlFor="reset-confirm-password">
                            Confirm password
                          </label>
                          <div className="relative">
                            <LockIcon className="auth-input-icon" />
                            <input
                              type={showResetConfirm ? "text" : "password"}
                              id="reset-confirm-password"
                              value={resetData.confirmPassword}
                              onChange={(e) =>
                                setResetData({ ...resetData, confirmPassword: e.target.value })
                              }
                              className="input pr-12"
                              placeholder="Re-enter password"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowResetConfirm((prev) => !prev)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                              aria-label={showResetConfirm ? "Hide password" : "Show password"}
                            >
                              {showResetConfirm ? (
                                <EyeIcon className="w-4 h-4" />
                              ) : (
                                <EyeOffIcon className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <button type="submit" className="auth-btn" disabled={isResettingPassword}>
                        {isResettingPassword ? (
                          <LoaderIcon className="w-full h-5 animate-spin text-center" />
                        ) : (
                          "Create new password"
                        )}
                      </button>
                      <p className="text-xs text-slate-400 text-center">
                        You'll be able to sign in immediately with your new password.
                      </p>
                    </form>
                  )}

                  <Link to="/signup" className="auth-secondary-link">
                    <span className="auth-secondary-link-title">Don't have an account?</span>
                    <span className="auth-secondary-link-cta">Sign up now</span>
                  </Link>
                </div>
              </div>
            </div>

            
            <div className="hidden md:w-1/2 md:flex items-center justify-center p-6 bg-gradient-to-bl from-slate-800/20 to-transparent">
              <div>
                <img
                  src="/login.png"
                  alt="People using mobile devices"
                  className="w-full h-auto object-contain"
                />
                <div className="mt-6 text-center">
                  <h3 className="text-xl font-medium text-cyan-400">Connect anytime, anywhere</h3>

                  <div className="mt-4 flex justify-center gap-4">
                    <span className="auth-badge">Free</span>
                    <span className="auth-badge">Easy Setup</span>
                    <span className="auth-badge">Private</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </BorderAnimatedContainer>
      </div>
    </div>
  );
}
export default LoginPage;