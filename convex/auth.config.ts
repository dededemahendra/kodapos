const domain = process.env.CONVEX_SITE_URL;
if (!domain) {
  throw new Error('CONVEX_SITE_URL is not set in the Convex environment.');
}

export default {
  providers: [
    {
      domain,
      applicationID: 'convex',
    },
  ],
};
