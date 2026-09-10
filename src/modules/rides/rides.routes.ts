import { type FastifyInstance } from 'fastify';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { calculateSuggestedPrice } from '@freteja/shared';
import type { VehicleType } from '@freteja/shared';

interface CreateRideBody {
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  cargo_description: string;
  cargo_category?: string;
  weight_range?: string;
  volume_range?: string;
  vehicle_type_preferred?: VehicleType;
  needs_helper?: boolean;
  notes?: string;
  scheduled_at?: string;
  schedule_window_minutes?: number;
}

interface RideParams {
  id: string;
}

export default async function ridesRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/rides — Create ride (embarcador only)
  fastify.post<{ Body: CreateRideBody }>('/api/rides', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const role = request.user.role;

    if (role !== 'embarcador') {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Apenas embarcadores podem criar fretes',
      });
    }

    const {
      origin_address, origin_lat, origin_lng,
      destination_address, destination_lat, destination_lng,
      cargo_description, cargo_category, weight_range, volume_range,
      vehicle_type_preferred, needs_helper, notes, scheduled_at, schedule_window_minutes,
    } = request.body;

    if (!origin_address || !destination_address || !cargo_description ||
        origin_lat == null || origin_lng == null || destination_lat == null || destination_lng == null) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Campos obrigatorios: origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, cargo_description',
      });
    }

    // Calculate distance using PostGIS ST_Distance
    const distResult = await fastify.db.query(
      `SELECT ST_Distance(
        ST_MakePoint($1, $2)::geography,
        ST_MakePoint($3, $4)::geography
      ) / 1000.0 as distance_km`,
      [origin_lng, origin_lat, destination_lng, destination_lat]
    );

    const distanceKm = parseFloat(distResult.rows[0].distance_km);
    const vehicleType = vehicle_type_preferred || 'carro';
    const suggestedPrice = calculateSuggestedPrice(distanceKm, vehicleType);

    const result = await fastify.db.query(
      `INSERT INTO rides (
        embarcador_id, origin_address, origin_location, destination_address, destination_location,
        cargo_description, cargo_category, weight_range, volume_range,
        vehicle_type_preferred, needs_helper, notes, suggested_price, scheduled_at, schedule_window_minutes
      ) VALUES (
        $1, $2, ST_MakePoint($3, $4)::geography, $5, ST_MakePoint($6, $7)::geography,
        $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      ) RETURNING id, status, suggested_price, created_at`,
      [
        userId, origin_address, origin_lng, origin_lat, destination_address, destination_lng, destination_lat,
        cargo_description, cargo_category || null, weight_range || null, volume_range || null,
        vehicle_type_preferred || null, Boolean(needs_helper), notes || null, suggestedPrice, scheduled_at || null, schedule_window_minutes || null,
      ]
    );

    const ride = result.rows[0];

    return reply.status(201).send({
      ride: {
        id: ride.id,
        status: ride.status,
        suggested_price: ride.suggested_price,
        distance_km: Math.round(distanceKm * 10) / 10,
        created_at: ride.created_at,
      },
    });
  });

  // GET /api/rides — List user's rides (embarcador) or available rides (motorista)
  fastify.get('/api/rides', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const role = request.user.role;

    let result;

    if (role === 'embarcador') {
      result = await fastify.db.query(
        `SELECT id, status, origin_address, destination_address, cargo_description,
                suggested_price, final_price, vehicle_type_preferred, scheduled_at, created_at
         FROM rides WHERE embarcador_id = $1
         ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );
    } else {
      // Motoristas see available rides (pending status)
      result = await fastify.db.query(
        `SELECT id, status, origin_address, destination_address, cargo_description,
                suggested_price, vehicle_type_preferred, scheduled_at, created_at
         FROM rides WHERE status = 'pending'
         ORDER BY created_at DESC LIMIT 50`
      );
    }

    return reply.send({ rides: result.rows });
  });

  // GET /api/rides/available — Available rides for motoristas
  fastify.get('/api/rides/available', {
    onRequest: [fastify.authenticate],
  }, async (_request, reply) => {
    const result = await fastify.db.query(
      `SELECT r.id, r.status, r.origin_address, r.destination_address, r.cargo_description,
              r.suggested_price, r.vehicle_type_preferred, r.weight_range, r.volume_range,
              r.notes, r.scheduled_at, r.created_at,
              u.name as embarcador_name
       FROM rides r
       JOIN users u ON r.embarcador_id = u.id
       WHERE r.status = 'pending'
       ORDER BY r.created_at DESC LIMIT 50`
    );

    return reply.send({ rides: result.rows });
  });

  // GET /api/rides/:id — Ride details
  fastify.get<{ Params: RideParams }>('/api/rides/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;

    const result = await fastify.db.query(
      `SELECT r.*,
              ST_Y(r.origin_location::geometry) as origin_lat,
              ST_X(r.origin_location::geometry) as origin_lng,
              ST_Y(r.destination_location::geometry) as destination_lat,
              ST_X(r.destination_location::geometry) as destination_lng,
              u.name as embarcador_name, u.phone as embarcador_phone
       FROM rides r
       JOIN users u ON r.embarcador_id = u.id
       WHERE r.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Frete nao encontrado',
      });
    }

    return reply.send({ ride: result.rows[0] });
  });

  // PATCH /api/rides/:id/cancel — Cancel a ride
  fastify.patch<{ Params: RideParams }>('/api/rides/:id/cancel', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.sub;

    const ride = await fastify.db.query(
      'SELECT id, embarcador_id, status FROM rides WHERE id = $1',
      [id]
    );

    if (ride.rows.length === 0) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Frete nao encontrado',
      });
    }

    if (ride.rows[0].embarcador_id !== userId) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Apenas o embarcador pode cancelar o frete',
      });
    }

    const cancellable = ['pending', 'accepted'];
    if (!cancellable.includes(ride.rows[0].status)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `Frete com status '${ride.rows[0].status}' nao pode ser cancelado`,
      });
    }

    await fastify.db.query(
      `UPDATE rides SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = 'cancelled_by_embarcador'
       WHERE id = $1`,
      [id]
    );

    return reply.send({ message: 'Frete cancelado', ride_id: id });
  });

  // PATCH /api/rides/:id/photos — Append cargo photos (embarcador only).
  // Body: { photos: string[] } with data URLs. Uploaded server-side to
  // Supabase storage (service role) so the app never holds secrets.
  fastify.patch<{ Params: RideParams; Body: { photos?: string[] } }>('/api/rides/:id/photos', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.sub;
    const photos = Array.isArray(request.body?.photos) ? request.body.photos.slice(0, 3) : [];
    if (!photos.length) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Nenhuma foto enviada' });
    }
    const ride = await fastify.db.query('SELECT id, embarcador_id FROM rides WHERE id = $1', [id]);
    if (ride.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Frete nao encontrado' });
    }
    if (ride.rows[0].embarcador_id !== userId) {
      return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Apenas o embarcador pode anexar fotos' });
    }
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return reply.status(500).send({ statusCode: 500, error: 'storage_unconfigured' });
    }
    const supabase = createSupabaseClient(supabaseUrl, serviceKey);
    const urls: string[] = [];
    for (const [index, dataUrl] of photos.entries()) {
      const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl || '');
      if (!match) continue;
      const ext = match[1].split('/')[1].replace('jpeg', 'jpg');
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 3 * 1024 * 1024) continue;
      const path = `${id}/${Date.now()}-${index}.${ext}`;
      const { error } = await supabase.storage.from('frete-cargas').upload(path, buffer, { contentType: match[1], upsert: false });
      if (error) continue;
      const { data } = supabase.storage.from('frete-cargas').getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    }
    if (!urls.length) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Nenhuma foto valida' });
    }
    await fastify.db.query(
      'UPDATE rides SET cargo_photo_urls = coalesce(cargo_photo_urls, \'{}\') || $2 WHERE id = $1',
      [id, urls]
    );
    return reply.send({ ride_id: id, photo_urls: urls });
  });
}
