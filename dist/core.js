/* Small, pure helpers shared by the interface and verification checks. */
const SpeedCore = (() => {
  const median = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  };
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
  return {median, jitter, distance, ratings};
})();
