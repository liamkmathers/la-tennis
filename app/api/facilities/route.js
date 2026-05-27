import { getFacilityOptions } from "../../../lib/availability";

export async function GET() {
  return Response.json({
    facilities: getFacilityOptions()
  });
}

