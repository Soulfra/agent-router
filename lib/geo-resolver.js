/**
 * Geo Resolver
 *
 * Resolves IP addresses to geographic locations:
 * - Country, state/region, city
 * - Latitude/longitude coordinates
 * - ISP/carrier information
 * - Timezone
 *
 * "Exact square foot of land on GIS mapping" - down to city/neighborhood level
 *
 * Uses MaxMind GeoIP2 or ip-api.com for resolution
 */

const https = require('https');

class GeoResolver {
  constructor(options = {}) {
    this.db = options.db;
    this.cacheEnabled = options.cacheEnabled !== false;
    this.cacheTTL = options.cacheTTL || 30 * 24 * 60 * 60 * 1000; // 30 days

    // API configuration (ip-api.com free tier)
    this.apiHost = 'ip-api.com';
    this.apiPath = '/json/';

    console.log('[GeoResolver] Initialized', {
      cacheEnabled: this.cacheEnabled,
      cacheTTL: this.cacheTTL
    });
  }

  /**
   * Resolve IP address to location
   *
   * @param {string} ipAddress - IP address
   * @returns {Promise<object>} - Location data
   */
  async resolve(ipAddress) {
    try {
      // Check cache first
      if (this.cacheEnabled && this.db) {
        const cached = await this.getCachedLocation(ipAddress);
        if (cached) {
          console.log(`[GeoResolver] Cache hit for ${ipAddress}`);
          return cached;
        }
      }

      // Fetch from API
      const location = await this.fetchFromAPI(ipAddress);

      // Cache result
      if (this.cacheEnabled && this.db && location) {
        await this.cacheLocation(ipAddress, location);
      }

      return location;

    } catch (error) {
      console.error(`[GeoResolver] Error resolving ${ipAddress}:`, error);
      return null;
    }
  }

  /**
   * Fetch location from ip-api.com
   *
   * @param {string} ipAddress - IP address
   * @returns {Promise<object>} - Location data
   */
  async fetchFromAPI(ipAddress) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.apiHost,
        path: `${this.apiPath}${ipAddress}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`,
        method: 'GET'
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', chunk => data += chunk);

        res.on('end', () => {
          try {
            const json = JSON.parse(data);

            if (json.status === 'fail') {
              console.error(`[GeoResolver] API error for ${ipAddress}:`, json.message);
              resolve(null);
              return;
            }

            // Normalize response
            const location = {
              ip_address: json.query,
              country: json.country,
              country_code: json.countryCode,
              region: json.regionName,
              region_code: json.region,
              city: json.city,
              zip: json.zip,
              latitude: json.lat,
              longitude: json.lon,
              timezone: json.timezone,
              isp: json.isp,
              org: json.org,
              as: json.as,
              resolved_at: new Date()
            };

            resolve(location);

          } catch (error) {
            reject(new Error(`Failed to parse API response: ${error.message}`));
          }
        });
      });

      req.on('error', reject);

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('API request timeout'));
      });

      req.end();
    });
  }

  /**
   * Get cached location from database
   *
   * @param {string} ipAddress - IP address
   * @returns {Promise<object|null>} - Cached location
   */
  async getCachedLocation(ipAddress) {
    try {
      // Convert milliseconds to seconds to avoid PostgreSQL interval overflow
      // PostgreSQL max interval in milliseconds is ~2147483647 (24 days)
      const cacheTTLSeconds = Math.floor(this.cacheTTL / 1000);

      const result = await this.db.query(`
        SELECT *
        FROM geo_locations
        WHERE ip_address = $1
          AND resolved_at >= NOW() - INTERVAL '${cacheTTLSeconds} seconds'
        LIMIT 1
      `, [ipAddress]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('[GeoResolver] Cache lookup error:', error);
      return null;
    }
  }

  /**
   * Cache location in database
   *
   * @param {string} ipAddress - IP address
   * @param {object} location - Location data
   * @returns {Promise<void>}
   */
  async cacheLocation(ipAddress, location) {
    try {
      await this.db.query(`
        INSERT INTO geo_locations (
          ip_address,
          country,
          country_code,
          region,
          region_code,
          city,
          zip,
          latitude,
          longitude,
          timezone,
          isp,
          org,
          as_number,
          resolved_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (ip_address) DO UPDATE
        SET
          country = EXCLUDED.country,
          country_code = EXCLUDED.country_code,
          region = EXCLUDED.region,
          region_code = EXCLUDED.region_code,
          city = EXCLUDED.city,
          zip = EXCLUDED.zip,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          timezone = EXCLUDED.timezone,
          isp = EXCLUDED.isp,
          org = EXCLUDED.org,
          as_number = EXCLUDED.as_number,
          resolved_at = NOW()
      `, [
        ipAddress,
        location.country,
        location.country_code,
        location.region,
        location.region_code,
        location.city,
        location.zip,
        location.latitude,
        location.longitude,
        location.timezone,
        location.isp,
        location.org,
        location.as
      ]);

      console.log(`[GeoResolver] Cached location for ${ipAddress}`);

    } catch (error) {
      console.error('[GeoResolver] Cache save error:', error);
    }
  }

  /**
   * Batch resolve multiple IP addresses
   *
   * @param {array} ipAddresses - Array of IP addresses
   * @returns {Promise<array>} - Array of location objects
   */
  async batchResolve(ipAddresses) {
    const results = [];

    for (const ip of ipAddresses) {
      try {
        const location = await this.resolve(ip);
        results.push({
          ip_address: ip,
          location,
          success: location !== null
        });

        // Rate limiting: 45 requests per minute on free tier
        await this.sleep(1400); // ~43 requests/minute

      } catch (error) {
        console.error(`[GeoResolver] Error resolving ${ip}:`, error);
        results.push({
          ip_address: ip,
          location: null,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get location string for display
   *
   * @param {object} location - Location data
   * @returns {string} - "City, Region, Country"
   */
  formatLocation(location) {
    if (!location) {
      return 'Unknown';
    }

    const parts = [];

    if (location.city) parts.push(location.city);
    if (location.region) parts.push(location.region);
    if (location.country) parts.push(location.country);

    return parts.join(', ') || 'Unknown';
  }

  /**
   * Get coordinates for mapping
   *
   * @param {object} location - Location data
   * @returns {object} - {lat, lng}
   */
  getCoordinates(location) {
    if (!location || !location.latitude || !location.longitude) {
      return null;
    }

    return {
      lat: location.latitude,
      lng: location.longitude
    };
  }

  /**
   * Calculate distance between two locations (in km)
   *
   * @param {object} loc1 - Location 1
   * @param {object} loc2 - Location 2
   * @returns {number} - Distance in kilometers
   */
  calculateDistance(loc1, loc2) {
    if (!loc1 || !loc2) return null;

    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(loc2.latitude - loc1.latitude);
    const dLon = this.toRad(loc2.longitude - loc1.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(loc1.latitude)) *
      Math.cos(this.toRad(loc2.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  /**
   * Convert degrees to radians
   */
  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Check if location is within a specific region
   *
   * @param {object} location - Location data
   * @param {string} countryCode - Country code (US, UK, etc.)
   * @returns {boolean}
   */
  isInCountry(location, countryCode) {
    if (!location || !location.country_code) return false;
    return location.country_code.toUpperCase() === countryCode.toUpperCase();
  }

  /**
   * Get location statistics from database
   *
   * @returns {Promise<object>} - Location stats
   */
  async getLocationStats() {
    try {
      const result = await this.db.query(`
        SELECT
          country,
          country_code,
          COUNT(*) as count,
          array_agg(DISTINCT city) as cities
        FROM geo_locations
        GROUP BY country, country_code
        ORDER BY count DESC
      `);

      return result.rows;

    } catch (error) {
      console.error('[GeoResolver] Error getting stats:', error);
      return [];
    }
  }

  /**
   * Sleep helper for rate limiting
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = GeoResolver;
