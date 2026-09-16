/* Small, pure helpers shared by the interface and verification checks. */
const SpeedCore = (() => {
  const median = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  };
  function percentile(values, fraction) {
    if(!values.length)return null;
    const sorted=[...values].sort((a,b)=>a-b), position=(sorted.length-1)*fraction;
    const lower=Math.floor(position), upper=Math.ceil(position);
    return sorted[lower]+(sorted[upper]-sorted[lower])*(position-lower);
  }
  const transferCap=(type,direction,provider)=>direction==='upload' ? provider==='Clouvider' ? 1000000 : 8000000 : type==='cloudflare' ? 8000000 : 16000000;
  const jitter = values => values.length < 2 ? 0 : values.slice(1).reduce((sum, value, i) => sum + Math.abs(value - values[i]), 0) / (values.length - 1);
  function distance(a, b) {
    const rad = n => n * Math.PI / 180;
    const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  function ratings(result) {
    const names = ['Online gaming', 'Video streaming', 'Cloud gaming', 'Video calls'];
    const metrics = ['downloadMbps', 'uploadMbps', 'pingMs', 'jitterMs'];
    const complete = result && (!result.status || result.status === 'complete');
    if (!complete || !metrics.every(key => Number.isFinite(result[key]) && result[key] >= 0)) {
      return names.map(name => ({
        name, grade: complete ? 'Measurements missing' : 'Awaiting test', level: 'neutral',
        evidence: 'A complete test is needed',
        detail: 'Readiness needs valid download, upload, idle RTT and jitter measurements from a completed flight.',
        advice: 'Complete a flight to estimate suitability on this route.'
      }));
    }
    const {downloadMbps: d, uploadMbps: u, pingMs: p, jitterMs: j} = result;
    const number = value => value.toFixed(value < 10 ? 1 : 0);
    const timing = `${number(p)} ms RTT · ${number(j)} ms jitter`;
    // A lone loaded probe is not enough to label a connection as unstable.
    const loads = ['download', 'upload'].flatMap(direction => {
      const samples = result[direction]?.loadedPings;
      const valid = Array.isArray(samples) ? samples.filter(n => Number.isFinite(n) && n >= 0) : [];
      return valid.length >= 3 ? [{direction, delta: median(valid) - p, count: valid.length}] : [];
    });
    const load = loads.sort((a, b) => b.delta - a.delta)[0];
    const congested = load?.delta >= 80;
    const loadDetail = congested
      ? ` Loaded RTT rose by ${number(load.delta)} ms during ${load.direction} (median of ${load.count} probes). Competing transfers may cause lag.`
      : '';
    const timingAdvice = 'Compare a lower-latency endpoint and the service you actually use; a distant test route can overstate delay.';
    const congestionAdvice = 'Pause competing transfers, then compare again. If the rise repeats, router queue management may help.';
    const make = (index, grade, level, evidence, detail, advice) => ({name: names[index], grade, level, evidence, detail, advice});

    let gaming;
    if (d < 5 || u < 1) {
      gaming = make(0, 'Bandwidth constrained', 'poor', `${number(d)} ↓ / ${number(u)} ↑ Mbps`,
        `This route falls below Orbit’s 5 Mbps down / 1 Mbps up gameplay allowance. ${timing}.${loadDetail}`,
        'Pause other traffic or lower background download use. Individual games can need less bandwidth.');
    } else if (p >= 150) {
      gaming = make(0, 'High latency', 'poor', timing,
        `Bandwidth is sufficient, but ${number(p)} ms idle HTTP RTT suggests noticeable input delay on this route.${loadDetail}`, timingAdvice);
    } else if (j >= 30) {
      gaming = make(0, 'Unstable timing', 'poor', timing,
        `Bandwidth is sufficient, but ${number(j)} ms jitter suggests uneven response times.${loadDetail}`,
        'Try Ethernet or a stronger Wi-Fi signal, pause other traffic, and compare endpoints.');
    } else if (congested) {
      gaming = make(0, 'Lag under load', 'fair', `+${number(load.delta)} ms during ${load.direction}`,
        `Idle timing: ${timing}.${loadDetail}`, congestionAdvice);
    } else {
      const grade = p >= 80 ? 'Noticeable delay' : j >= 15 ? 'Variable timing' : p < 40 && j < 10 ? 'Responsive' : 'Playable';
      gaming = make(0, grade, p >= 80 || j >= 15 ? 'fair' : 'good', timing,
        `There is enough bandwidth for typical online gameplay. Orbit’s most responsive tier uses idle RTT below 40 ms and jitter below 10 ms.`,
        p >= 80 || j >= 15 ? timingAdvice : 'Good measured timing for this route; competitive play still depends on the game server.');
    }

    const resolution = d >= 15 ? '4K' : d >= 5 ? '1080p' : d >= 3 ? '720p' : null;
    const streaming = make(1, resolution ? `${resolution} streaming` : d >= 1 ? 'Lower-resolution video' : 'Buffering likely',
      resolution ? 'good' : d >= 1 ? 'fair' : 'poor',
      `${number(d)} Mbps down${d >= 15 ? ` · ≈${Math.floor(d / 15)} × 4K` : ''}`,
      `Netflix recommends stable download rates of 3 Mbps for 720p, 5 Mbps for 1080p and 15 Mbps for 4K. This is a bandwidth estimate; any stream count excludes overhead and other traffic.`,
      resolution ? 'Leave headroom for other devices. High idle RTT alone does not rule out buffered video.' : 'Use a lower video quality or allow more buffering; actual bitrates vary by service.');

    const cloudResolution = d >= 35 ? '1440p' : d >= 25 ? '1080p' : '720p';
    const cloudEvidence = `${cloudResolution} bandwidth · ${number(p)} ms RTT`;
    let cloud;
    if (d < 15) {
      cloud = make(2, 'More bandwidth needed', 'poor', `${number(d)} Mbps down · 15+ recommended`,
        `This result is below GeForce NOW’s 15 Mbps entry-level bandwidth guidance. ${timing}.${loadDetail}`,
        'Try a lower-resolution service or compare another endpoint before starting cloud play.');
    } else if (p >= 80) {
      cloud = make(2, 'High input delay', 'poor', cloudEvidence,
        `Bandwidth supports a ${cloudResolution} tier, but ${number(p)} ms HTTP RTT is above the 80 ms reference ceiling. NVIDIA’s requirement applies to its own data centers, which this test does not measure.${loadDetail}`, timingAdvice);
    } else if (j >= 20) {
      cloud = make(2, 'Uneven response', 'fair', `${cloudResolution} bandwidth · ${number(j)} ms jitter`,
        `There is enough download bandwidth, but variable timing may disrupt interactive video.${loadDetail}`,
        'Try Ethernet or improve Wi-Fi reception, then compare timing to your gaming service.');
    } else if (congested) {
      cloud = make(2, 'Lag under load', 'fair', `${cloudResolution} · +${number(load.delta)} ms loaded`,
        `Bandwidth supports ${cloudResolution}; idle timing is ${timing}.${loadDetail}`, congestionAdvice);
    } else {
      const responsive = p < 40 && j < 10;
      cloud = make(2, `${cloudResolution} · ${responsive ? 'responsive' : 'some lag'}`, responsive ? 'good' : 'fair', timing,
        'Browser cloud-gaming bandwidth tiers follow GeForce NOW: 15 Mbps for 720p, 25 for 1080p and 35 for 1440p. Lower RTT and jitter improve interactive response.',
        'Confirm with the service’s own network test; its route and session performance can differ.');
    }

    const callTier = d >= 3 && u >= 3.8 ? '1080p calls'
      : d >= 1.8 && u >= 2.6 ? '720p group calls'
      : d >= 1.2 && u >= 1.2 ? '720p one-to-one'
      : d >= 0.6 && u >= 1 ? 'Basic video calls' : null;
    const callEvidence = `${number(u)} Mbps up · ${number(p)} ms RTT`;
    const callDetail = `Measured ${number(d)} Mbps down / ${number(u)} Mbps up, with ${number(p)} ms HTTP RTT and ${number(j)} ms jitter. Bandwidth tiers follow Zoom guidance for one call; timing warnings are Orbit heuristics.${loadDetail}`;
    let calls;
    if (d < 0.1 || u < 0.1) {
      calls = make(3, 'Call dropouts likely', 'poor', `${number(d)} ↓ / ${number(u)} ↑ Mbps`, callDetail,
        'Even audio has little bandwidth headroom. Pause other traffic and retry.');
    } else if (!callTier) {
      calls = make(3, 'Audio-first calls', 'fair', `${number(d)} ↓ / ${number(u)} ↑ Mbps`,
        callDetail + ` Video bandwidth is constrained; ${timing}.`,
        'Turn off video to conserve bandwidth. High delay or jitter can still affect audio.');
    } else {
      const issue = p >= 300 ? 'high delay' : j >= 40 ? 'choppy timing' : congested ? 'lag under load' : p >= 150 || j >= 20 ? 'some delay' : '';
      calls = make(3, issue ? `${callTier} · ${issue}` : callTier,
        p >= 300 || j >= 40 ? 'poor' : issue || callTier === 'Basic video calls' ? 'fair' : 'good',
        issue === 'lag under load' ? `${number(u)} Mbps up · +${number(load.delta)} ms loaded`
          : issue === 'choppy timing' || (j >= 20 && p < 150) ? `${number(u)} Mbps up · ${number(j)} ms jitter` : callEvidence,
        callDetail + ` ${callTier} have enough bandwidth; ${issue || 'idle timing is favorable'} on this test route.`,
        congested ? congestionAdvice : issue ? 'Allow for conversational delay; compare the calling app’s own statistics and another endpoint.' : 'Keep upload headroom for other participants and devices.');
    }
    return [gaming, streaming, cloud, calls];
  }
  const networkLabels={unknown:'Not exposed',wifi:'Wi-Fi',ethernet:'Ethernet',cellular:'Cellular · generation unknown','3g':'3G','4g':'4G / LTE','5g':'5G',bluetooth:'Bluetooth',wimax:'WiMAX',mixed:'Multiple interfaces',other:'Other',none:'Offline'};
  function networkSnapshot(info,choice='auto',online=true) {
    const manual=['wifi','ethernet','cellular','3g','4g','5g','other'].includes(choice);
    const reported=['wifi','ethernet','cellular','bluetooth','wimax','mixed','other','none'].includes(info?.type) ? info.type : 'unknown';
    const type=online===false ? 'none' : manual ? choice : reported;
    return {type,source:online===false ? 'browser' : manual ? 'manual' : reported==='unknown' ? 'unavailable' : 'browser',
      effectiveType:['slow-2g','2g','3g','4g'].includes(info?.effectiveType) ? info.effectiveType : 'unknown',saveData:info?.saveData===true};
  }
  function networkLabel(network) {
    return network ? `${networkLabels[network.type] || 'Not exposed'} · ${network.source==='manual' ? 'user labelled' : network.source==='browser' ? 'browser reported' : 'browser unavailable'}` : 'Not recorded';
  }
  // Approximate city centers. Timezone matches are suggestions, never device fixes.
  const locations = [
    ['Abu Dhabi, UAE',24.45,54.38,[]],
    ['Amsterdam, Netherlands',52.37,4.90,['Europe/Amsterdam']],
    ['Athens, Greece',37.98,23.73,['Europe/Athens']],
    ['Auckland, New Zealand',-36.85,174.76,['Pacific/Auckland']],
    ['Bangkok, Thailand',13.76,100.50,['Asia/Bangkok']],
    ['Bengaluru, India',12.97,77.59,[]],
    ['Berlin, Germany',52.52,13.41,['Europe/Berlin']],
    ['Bogota, Colombia',4.71,-74.07,['America/Bogota']],
    ['Cairo, Egypt',30.04,31.24,['Africa/Cairo']],
    ['Cape Town, South Africa',-33.92,18.42,[]],
    ['Chennai, India',13.08,80.27,[]],
    ['Chicago, USA',41.88,-87.63,['America/Chicago']],
    ['Dallas, USA',32.78,-96.80,[]],
    ['Delhi, India',28.61,77.21,[]],
    ['Denver, USA',39.74,-104.99,['America/Denver']],
    ['Dhaka, Bangladesh',23.81,90.41,['Asia/Dhaka']],
    ['Doha, Qatar',25.29,51.53,['Asia/Qatar']],
    ['Dubai, UAE',25.20,55.27,['Asia/Dubai']],
    ['Dublin, Ireland',53.35,-6.26,['Europe/Dublin']],
    ['Frankfurt, Germany',50.11,8.68,[]],
    ['Hong Kong',22.32,114.17,['Asia/Hong_Kong']],
    ['Hyderabad, India',17.39,78.49,[]],
    ['Istanbul, Turkey',41.01,28.98,['Europe/Istanbul']],
    ['Jakarta, Indonesia',-6.21,106.85,['Asia/Jakarta']],
    ['Johannesburg, South Africa',-26.20,28.04,['Africa/Johannesburg']],
    ['Karachi, Pakistan',24.86,67.01,['Asia/Karachi']],
    ['Kolkata, India',22.57,88.36,['Asia/Kolkata','Asia/Calcutta']],
    ['Kuala Lumpur, Malaysia',3.14,101.69,['Asia/Kuala_Lumpur']],
    ['Lagos, Nigeria',6.52,3.38,['Africa/Lagos']],
    ['London, UK',51.51,-0.13,['Europe/London']],
    ['Los Angeles, USA',34.05,-118.24,['America/Los_Angeles']],
    ['Madrid, Spain',40.42,-3.70,['Europe/Madrid']],
    ['Manila, Philippines',14.60,120.98,['Asia/Manila']],
    ['Melbourne, Australia',-37.81,144.96,['Australia/Melbourne']],
    ['Mexico City, Mexico',19.43,-99.13,['America/Mexico_City']],
    ['Mumbai, India',19.08,72.88,[]],
    ['Muscat, Oman',23.59,58.41,['Asia/Muscat']],
    ['Nairobi, Kenya',-1.29,36.82,['Africa/Nairobi']],
    ['New York, USA',40.71,-74.01,['America/New_York']],
    ['Paris, France',48.86,2.35,['Europe/Paris']],
    ['Perth, Australia',-31.95,115.86,['Australia/Perth']],
    ['Prague, Czech Republic',50.08,14.44,['Europe/Prague']],
    ['Riyadh, Saudi Arabia',24.71,46.68,['Asia/Riyadh']],
    ['Rome, Italy',41.90,12.50,['Europe/Rome']],
    ['San Francisco, USA',37.77,-122.42,[]],
    ['Sao Paulo, Brazil',-23.55,-46.63,['America/Sao_Paulo']],
    ['Seattle, USA',47.61,-122.33,[]],
    ['Seoul, South Korea',37.57,126.98,['Asia/Seoul']],
    ['Shanghai, China',31.23,121.47,['Asia/Shanghai']],
    ['Sharjah, UAE',25.35,55.42,[]],
    ['Singapore',1.35,103.82,['Asia/Singapore']],
    ['Stockholm, Sweden',59.33,18.07,['Europe/Stockholm']],
    ['Sydney, Australia',-33.87,151.21,['Australia/Sydney']],
    ['Taipei, Taiwan',25.03,121.57,['Asia/Taipei']],
    ['Tokyo, Japan',35.68,139.65,['Asia/Tokyo']],
    ['Toronto, Canada',43.65,-79.38,['America/Toronto']],
    ['Vancouver, Canada',49.28,-123.12,['America/Vancouver']],
    ['Warsaw, Poland',52.23,21.01,['Europe/Warsaw']],
    ['Zurich, Switzerland',47.38,8.54,['Europe/Zurich']]
  ].map(([name,lat,lon,zones])=>({name,point:[lat,lon],zones}));
  const validPoint = point => Array.isArray(point) && point.length===2 && point.every(Number.isFinite) && Math.abs(point[0])<=90 && Math.abs(point[1])<=180;
  function locationName(point) {
    if(!validPoint(point))return 'Location unavailable';
    const nearest=locations.reduce((best,city)=>distance(point,city.point)<distance(point,best.point)?city:best);
    return distance(point,nearest.point)<60 ? `Near ${nearest.name}` : `${Math.abs(point[0]).toFixed(1)}° ${point[0]<0?'S':'N'}, ${Math.abs(point[1]).toFixed(1)}° ${point[1]<0?'W':'E'}`;
  }
  const suggestedLocation = zone => locations.find(city=>city.zones.includes(zone));
  const dialFraction = value => Number.isFinite(value) ? Math.min(1,Math.max(0,value)/1000) : 0;
  return {networkSnapshot, networkLabel, networkLabels, median, percentile, transferCap, jitter, distance, ratings, locations, validPoint, locationName, suggestedLocation, dialFraction};
})();
