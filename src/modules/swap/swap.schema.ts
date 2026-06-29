import { z } from "zod";

// abre um pedido de troca sem alvo fixo — broadcast pro grupo
export const CreateSwapBody = z.object({
  message: z.string().max(300).optional(),
});
export type CreateSwapBody = z.infer<typeof CreateSwapBody>;

// qualquer membro aceita a troca, informando qual slot vai cobrir
export const AcceptSwapBody = z.object({
  volunteer_slot_id: z.string().min(1),
});
export type AcceptSwapBody = z.infer<typeof AcceptSwapBody>;

// rejeitar ou aprovar (usado pelo voluntário que aceitou, e pelo líder)
export const ReviewSwapBody = z.object({
  action: z.enum(["ACCEPT", "REJECT"]),
  rejection_reason: z.string().max(300).optional(),
  // só usado quando action === 'ACCEPT' e é o voluntário aceitando
  volunteer_slot_id: z.string().min(1).optional(),
});
export type ReviewSwapBody = z.infer<typeof ReviewSwapBody>;

export type SwapResponse = {
  id: string;
  status: string;
  message: string | null;
  rejection_reason: string | null;
  created_at: Date;
  resolved_at: Date | null;
  requester: {
    id: string;
    role_labels: string[];
    member: { id: string; user: { name: string; avatar_url: string | null } };
  };
  volunteer: {
    id: string;
    role_labels: string[];
    member: { id: string; user: { name: string; avatar_url: string | null } };
  } | null;
};
