import { Controller, Get, Module, Query, ServiceUnavailableException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { latLng } from '../common/util';
import { Z } from '../common/zod.pipe';

/**
 * Address search behind a provider switch (Google Geocoding today). The API key stays on the server.
 * Without GOOGLE_MAPS_API_KEY the app still works with GPS location.
 */
@Controller('geo')
class GeoController {
  private key = process.env.GOOGLE_MAPS_API_KEY;

  private async google(params: Record<string, string>) {
    if (!this.key) throw new ServiceUnavailableException('Address search is not set up yet. Use your current location.');
    const qs = new URLSearchParams({ ...params, key: this.key, region: 'in', language: 'en' });
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`);
    const body: any = await res.json();
    return (body.results ?? []).slice(0, 5).map((r: any) => ({
      label: r.formatted_address as string,
      lat: r.geometry.location.lat as number,
      lng: r.geometry.location.lng as number,
      pincode: r.address_components?.find((c: any) => c.types.includes('postal_code'))?.long_name ?? null,
      area: r.address_components?.find((c: any) => c.types.includes('sublocality_level_1') || c.types.includes('locality'))?.long_name ?? null,
    }));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('search')
  search(@Query(Z(z.object({ q: z.string().trim().min(3).max(120) }))) q: { q: string }) {
    return this.google({ address: q.q, components: 'country:IN' });
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('reverse')
  reverse(@Query(Z(z.object({ lat: z.coerce.number().pipe(latLng.lat), lng: z.coerce.number().pipe(latLng.lng) }))) q: { lat: number; lng: number }) {
    return this.google({ latlng: `${q.lat},${q.lng}` });
  }
}

@Module({ controllers: [GeoController] })
export class GeoModule {}
