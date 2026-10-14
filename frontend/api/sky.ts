// GET /api/sky: sky state and UV for the station's location, from Open-Meteo.
import type { SkyResponse } from '../shared/api-types.js';
import { badRequest, json, serverError } from '../server/http.js';
import { fetchSky } from '../server/open-meteo.js';
import { rejectUnexpectedParams } from '../server/params.js';

// Open-Meteo updates current values every 15 minutes. The CDN cache also keeps our
// calls far below its free limits, however many people open the dashboard.
const CACHE = { sMaxAge: 900, staleWhileRevalidate: 900 };

export async function GET(request: Request): Promise<Response> {
  const invalid = rejectUnexpectedParams(new URL(request.url), []);
  if (invalid) {
    return badRequest(invalid);
  }

  try {
    return json<SkyResponse>(await fetchSky(), CACHE);
  } catch (error) {
    return serverError(error);
  }
}
