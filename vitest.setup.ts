import { Logger } from "@nestjs/common";

/* Assertions target the mocked collaborators, not stdout, so the application
   logger only adds noise to test output. */
Logger.overrideLogger(false);
