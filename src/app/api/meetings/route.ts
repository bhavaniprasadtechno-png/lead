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
 * Agent 5's n8n workflow falls back to this literal string when the
 * CAL_COM_BOOKING_LINK n8n Variable was unset at send time — it's a
 * dead 404 on cal.com, not a real booking page. Older meeting_booked
 * activities logged before that Variable was configured have it baked
 * into their stored payload; filter it out here rather than link to it.
 */
const PLACEHOLDER_BOOKING_LINK = "https://cal.com/your-team/intro";

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
      const bookingLink = payload.bookingLink && payload.bookingLink !== PLACEHOLDER_BOOKING_LINK ? payload.bookingLink : null;
      return {
        id: a.id,
        createdAt: a.createdAt,
        lead: a.lead,
        bookingLink,
        subject: payload.subject ?? null,
        body: payload.body ?? null,
      };
    });
    return json({ meetings });
  } catch (err) {
    return handleApiError(err);
  }
}
