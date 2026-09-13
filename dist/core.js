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
    const {downloadMbps: d, uploadMbps: u, pingMs: p, jitterMs: j} = result;
    return [
      {name:'Online gaming', grade:p<40 && j<10 && d>=10 && u>=3 ? 'Excellent' : p<80 && j<20 && d>=5 && u>=1 ? 'Good' : 'Limited', detail:`${p.toFixed(0)} ms ping · ${j.toFixed(1)} ms jitter. Lower is better.`},
      {name:'Video streaming', grade:d>=15 ? '4K ready' : d>=5 ? '1080p ready' : d>=3 ? '720p ready' : 'Limited', detail:d>=15 ? `Bandwidth for approximately ${Math.max(1,Math.floor(d/15))} 4K streams at 15 Mbps each, before sharing and overhead.` : 'A stable 15 Mbps supports one Netflix 4K stream.'},
      {name:'Cloud gaming', grade:d>=25 && p<40 && j<10 ? 'Promising' : d>=15 && p<80 && j<20 ? 'Fair' : 'Limited', detail:'1080p needs about 25 Mbps. Latency to the actual gaming service can differ.'},
      {name:'Video calls', grade:d>=10 && u>=5 && p<100 && j<20 ? 'Excellent' : d>=3 && u>=3 && p<150 && j<30 ? 'Good' : 'Limited', detail:`${u.toFixed(1)} Mbps upload available. Ratings are practical estimates for one call.`},
    ];
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
