import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json } from "@/lib/api";

interface MeetingBookedPayload {
  bookingLink?: string;
  subject?: string;
  body?: string;
  messageId?: string;
  threadId?: string;
}

/**
 * GET /api/meetings — every meeting the Scheduler agent has proposed to a
 * lead, newest first. This reflects the booking email being sent (a real
 * `meeting_booked` Activity + Lead.status transition, written by
 * POST /api/webhooks/inbound), not a confirmed calendar booking — there's
 * no Cal.com "booking confirmed" webhook wired into this app yet, so a
 * lead here has been offered times, not necessarily locked one in.
 */
export async function GET() {
  try {
    const session = await requireOrgSession();
    const activities = await prisma.activity.findMany({
      where: { type: "meeting_booked", lead: { orgId: session.orgId } },
      orderBy: { createdAt: "desc" },
      include: {
        lead: {
          select: { id: true, firstName: true, lastName: true, email: true, company: true, jobTitle: true, status: true },
        },
      },
    });
    const meetings = activities.map((a) => {
      const payload = (a.payload ?? {}) as MeetingBookedPayload;
      return {
        id: a.id,
        createdAt: a.createdAt,
        lead: a.lead,
        bookingLink: payload.bookingLink ?? null,
        subject: payload.subject ?? null,
        body: payload.body ?? null,
      };
    });
    return json({ meetings });
  } catch (err) {
    return handleApiError(err);
  }
}
