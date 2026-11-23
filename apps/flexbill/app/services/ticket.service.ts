import { createTicketService } from "@even/payments";

export const ticketService = createTicketService({ baseUrl: process.env.NEXT_PUBLIC_API_URL });
