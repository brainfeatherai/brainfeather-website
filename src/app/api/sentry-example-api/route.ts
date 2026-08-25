import { reportServerError } from "@/lib/server/report-error";

function verificationEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function GET() {
  if (!verificationEnabled()) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const eventId = reportServerError(new Error("Sentry Example API Route Error"), {
    operation: "sentry.test_server",
    route: "/api/sentry-example-api",
  });
  return Response.json({ error: "Sentry test error captured.", eventId }, { status: 500 });
}
