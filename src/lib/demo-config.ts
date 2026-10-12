import "server-only";

export const demoRegistrationEnabled = () => process.env.DEMO_SIGNUP_ENABLED === "true";
