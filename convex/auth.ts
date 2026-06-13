import Google from '@auth/core/providers/google';
import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import { ResendOTP } from './otp/ResendOTP';
import { ResendOTPReset } from './otp/ResendOTPReset';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Email + password sign-in (kept intact, additive change only). `reset`
    // wires the emailed-code password-reset flow ("reset" / "reset-verification").
    Password({
      // The default Password provider only persists `email` + `password`. Map
      // the `name` field signup passes through to the `users.name` column so
      // queries like `users.hello` can greet the owner by name.
      profile(params) {
        const email = params.email as string;
        return typeof params.name === 'string' && params.name.length > 0
          ? { email, name: params.name }
          : { email };
      },
      reset: ResendOTPReset,
    }),
    // Google OAuth. Reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from the env; the
    // callback route is registered by `auth.addHttpRoutes` in convex/http.ts.
    Google,
    // Passwordless sign-in: a 6-digit emailed code (also a magic link).
    ResendOTP,
  ],
});
