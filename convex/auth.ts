import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
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
    }),
  ],
});
