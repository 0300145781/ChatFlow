"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { nanoid } from "nanoid";
import { Loader2 } from "lucide-react";

import { ChatFlowLogo } from "../components/ChatFlowLogo";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true); // Start loading true while checking session
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push("/dashboard");
      } else {
        setLoading(false);
      }
    };
    checkSession();
  }, [router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (isLogin) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        router.push("/dashboard");
      } else {
        const friendCode = nanoid(6).toUpperCase();
        
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              friend_code: friendCode,
              public_key: null, // No longer used
            },
          },
        });
        if (signUpError) throw signUpError;
        
        if (data.session) {
          router.push("/dashboard");
        } else {
          setSuccessMsg("Successfully signed up! Please check your email for the confirmation link.");
          setIsLogin(true);
        }
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] dark:bg-[#191919] p-4 bg-gradient-to-br from-[#ffffff] to-[#f7f7f5] dark:from-[#191919] dark:to-[#111111]">
      <div className="notion-card w-full max-w-md p-8 bg-white dark:bg-[#202020]">
        <div className="flex flex-col items-center text-center mb-8">
          <ChatFlowLogo className="w-16 h-16 mb-4" />
          <h1 className="text-2xl font-semibold mb-2 text-foreground">
            {isLogin ? "Welcome to ChatFlow" : "Join ChatFlow"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isLogin
              ? "Enter your details to access your chats"
              : "Sign up to start chatting with friends"}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Email</label>
            <input
              type="email"
              required
              className="notion-input w-full"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Password</label>
            <input
              type="password"
              required
              className="notion-input w-full"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="remember" className="rounded border-gray-300 text-primary focus:ring-primary" defaultChecked />
            <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
              Remember me
            </label>
          </div>

          {error && (
            <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="text-green-600 dark:text-green-400 text-sm bg-green-50 dark:bg-green-900/10 p-3 rounded-lg border border-green-200 dark:border-green-800">
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="notion-button w-full flex justify-center items-center mt-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isLogin ? (
              "Log in"
            ) : (
              "Sign up"
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {isLogin
              ? "Don't have an account? Sign up"
              : "Already have an account? Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}
