import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.js";
import { loginRateLimit } from "../../shared/middlewares/rate-limit.js";
import { validate } from "../../shared/middlewares/validate.js";
import { AuthController } from "./auth.controller.js";
import { loginSchema, refreshTokenSchema } from "./auth.validators.js";

export const authRoutes = Router();

authRoutes.post("/login", loginRateLimit, validate("body", loginSchema), AuthController.login);
authRoutes.post("/refresh", validate("body", refreshTokenSchema), AuthController.refresh);
authRoutes.post("/logout", validate("body", refreshTokenSchema), AuthController.logout);
authRoutes.get("/me", authenticate, AuthController.me);
