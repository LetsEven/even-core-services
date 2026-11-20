"use client";

import { createAuth } from "@even/auth/react";
import { authService } from "../services/auth.service";

export const { AuthProvider, useAuth } = createAuth(authService, {
  fetchProfileOnVerify: false,
  adaptiveRefresh: false,
  syncTabs: false,
});
