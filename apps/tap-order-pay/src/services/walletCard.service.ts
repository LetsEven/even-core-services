import { createWalletCardService } from "@even/payments";
import { requestWithAuth } from "./request-helper";

export const walletCardService = createWalletCardService(requestWithAuth);
