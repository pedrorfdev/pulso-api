import { z } from "zod";

export const UpdateProfileBody = z.object({
  nickname: z.string().min(1).max(60).optional(),
});
export type UpdateProfileBody = z.infer<typeof UpdateProfileBody>;

export type AttendanceHistoryEntry = {
  event: {
    id: string;
    title: string;
    location: string | null;
    starts_at: Date;
  };
  role_labels: string[];
  attendance: {
    status: string;
    justification: string | null;
    responded_at: Date | null;
  } | null;
  swap: {
    id: string;
    status: string;
    was_requester: boolean;
  } | null;
};

export type MemberProfileResponse = {
  member_id: string;
  role: string;
  nickname: string | null;
  joined_at: Date;
  user: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  };
  stats: {
    confirmed_on_time: number;
    confirmed_late: number;
    absences: number;
    deadline_misses: number;
    swaps_requested: number;
    swaps_accepted: number;
    reliability_score: number;
  } | null;
  history: AttendanceHistoryEntry[];
};
