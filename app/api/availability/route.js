import { getAvailability } from "../../../lib/availability";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const availability = await getAvailability({
    date: searchParams.get("date"),
    area: searchParams.get("area")
  });

  return Response.json({
    generatedAt: new Date().toISOString(),
    ...availability
  });
}
