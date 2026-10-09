import { StagingSetupError, validateStagingTarget } from "./staging-bootstrap";
try {
  validateStagingTarget(process.env);
  console.log("Staging database target verified.");
} catch (error: unknown) {
  console.error(error instanceof StagingSetupError ? error.message : "Staging target validation failed.");
  process.exitCode = 1;
}
