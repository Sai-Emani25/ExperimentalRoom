
import { isPointInPolygon, getPolygonArea } from './src/utils.js';

// Mock generateMapGeometry logic or just define a simple square
const square = [
    {x: 0, z: 0},
    {x: 10, z: 0},
    {x: 10, z: 10},
    {x: 0, z: 10},
    {x: 0, z: 0}
];

const area = getPolygonArea(square);
console.log('Square Area (should be 100):', area);

const inside = isPointInPolygon({x: 5, z: 5}, square);
console.log('Point 5,5 Inside (should be true):', inside);

const outside = isPointInPolygon({x: 15, z: 5}, square);
console.log('Point 15,5 Inside (should be false):', outside);

const boundary = isPointInPolygon({x: 10, z: 5}, square);
console.log('Point 10,5 Inside (boundary, usually false/true depending on impl):', boundary);
