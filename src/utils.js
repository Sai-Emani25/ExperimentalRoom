export const MAP_TYPES = [
  'circle',
  'triangle',
  'square',
  'oval',
  'rectangle',
  'random',
  'star'
];

export function getHourlyMap() {
  const now = new Date();
  const hoursSinceEpoch = Math.floor(now.getTime() / (1000 * 60 * 60));
  
  // Simple deterministic "random" based on hour
  // Using a simple hash function to mix it up so it's not just sequential if we don't want it to be
  const index = (hoursSinceEpoch * 1337) % MAP_TYPES.length;
  
  return {
    name: MAP_TYPES[index],
    id: index,
    seed: hoursSinceEpoch,
    endTime: new Date((hoursSinceEpoch + 1) * 60 * 60 * 1000)
  };
}

// Simple seeded random function
function seededRandom(seed) {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

export function generateMapGeometry(typeOrObj, size = 1250) {
  const type = typeof typeOrObj === 'string' ? typeOrObj : typeOrObj.name;
  const seed = typeof typeOrObj === 'object' ? typeOrObj.seed : 12345;
  
  // Returns vertices for the map boundary
  const points = [];
  const segments = 64; // Resolution for curves

  switch (type) {
    case 'circle':
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push({ x: Math.cos(theta) * size, z: Math.sin(theta) * size });
      }
      break;
    case 'triangle':
      const r = size;
      for (let i = 0; i < 3; i++) {
          const theta = (i / 3) * Math.PI * 2 - Math.PI / 2; // Start at top
          points.push({ x: Math.cos(theta) * r, z: Math.sin(theta) * r });
      }
      points.push(points[0]); // Close loop
      break;
    case 'square':
      points.push({ x: -size, z: -size });
      points.push({ x: size, z: -size });
      points.push({ x: size, z: size });
      points.push({ x: -size, z: size });
      points.push({ x: -size, z: -size });
      break;
    case 'oval':
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            points.push({ x: Math.cos(theta) * size * 1.5, z: Math.sin(theta) * size * 0.8 });
        }
        break;
    case 'rectangle':
        points.push({ x: -size * 1.5, z: -size });
        points.push({ x: size * 1.5, z: -size });
        points.push({ x: size * 1.5, z: size });
        points.push({ x: -size * 1.5, z: size });
        points.push({ x: -size * 1.5, z: -size });
        break;
    case 'star':
        const innerRadius = size * 0.4;
        const outerRadius = size;
        const spikes = 5;
        for (let i = 0; i <= spikes * 2; i++) {
            const r = (i % 2 === 0) ? outerRadius : innerRadius;
            const theta = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
            points.push({ x: Math.cos(theta) * r, z: Math.sin(theta) * r });
        }
        break;
    case 'random':
        // Generate a deterministic random shape based on seed
        let currentSeed = seed;
        for (let i = 0; i < 8; i++) {
            const theta = (i / 8) * Math.PI * 2;
            const r = size * (0.5 + seededRandom(currentSeed++) * 0.5); 
            points.push({ x: Math.cos(theta) * r, z: Math.sin(theta) * r }); 
        }
        points.push(points[0]);
        break;
    default:
      // Fallback to square
      points.push({ x: -size, z: -size });
      points.push({ x: size, z: -size });
      points.push({ x: size, z: size });
      points.push({ x: -size, z: size });
      points.push({ x: -size, z: -size });
  }
  return points;
}

export function isPointInPolygon(point, vs) {
    // ray-casting algorithm based on
    // https://github.com/substack/point-in-polygon
    // point: {x, z}, vs: Array of {x, z}
    
    let x = point.x, y = point.z;
    
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].z;
        let xj = vs[j].x, yj = vs[j].z;
        
        let intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    
    return inside;
}

export function getPolygonArea(vertices) {
    let total = 0;
    for (let i = 0, l = vertices.length; i < l; i++) {
      const addX = vertices[i].x;
      const addY = vertices[i == vertices.length - 1 ? 0 : i + 1].z;
      const subX = vertices[i == vertices.length - 1 ? 0 : i + 1].x;
      const subY = vertices[i].z;
      total += (addX * addY * 0.5);
      total -= (subX * subY * 0.5);
    }
    return Math.abs(total);
}
