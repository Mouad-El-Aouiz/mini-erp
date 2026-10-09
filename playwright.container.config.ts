import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// The dedicated Compose project owns the server and its lifecycle.
export default defineConfig({ ...base, webServer: undefined });
