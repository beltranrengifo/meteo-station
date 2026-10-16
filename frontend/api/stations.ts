// GET /api/stations: the stations the dashboard lists (devices.listed), and the default one.
import type { StationsResponse } from '../shared/api-types.js';
import { badRequest, json, serverError } from '../server/http.js';
import { rejectUnexpectedParams } from '../server/params.js';
import { defaultStation, listedStations } from '../server/supabase.js';

// Same as the server's own list cache: a newly listed station shows up within a minute.
const CACHE = { sMaxAge: 60, staleWhileRevalidate: 60 };

export async function GET(request: Request): Promise<Response> {
  const invalid = rejectUnexpectedParams(new URL(request.url), [], []);
  if (invalid) {
    return badRequest(invalid);
  }

  try {
    const stations = await listedStations();
    return json<StationsResponse>({ stations, defaultId: defaultStation(stations) }, CACHE);
  } catch (error) {
    return serverError(error);
  }
}
