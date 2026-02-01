import * as THREE from 'three';

export class GameEngine {
  constructor(container, mapType, isHost, onGameOver) {
    this.container = container;
    this.mapType = mapType;
    this.isHost = isHost;
    this.onGameOver = onGameOver;
    
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    
    this.players = {}; // { id: { mesh, color, quaternion, ... } }
    this.myId = null;
    
    // Texture System
    this.texSize = 1024;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.texSize;
    this.canvas.height = this.texSize;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    
    // Fill white (neutral)
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.texSize, this.texSize);
    
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    
    this.raycaster = new THREE.Raycaster();
    
    this.init();
  }

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);
    
    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(10, 20, 10);
    this.scene.add(dir);
    
    // Map
    this.createMap();
    
    // Camera Position (Fixed relative to player)
    // Scale camera with map size (approx 2x radius height, 3x radius back)
    const camDist = this.mapRadius * 3;
    this.camera.position.set(0, camDist * 0.8, camDist); 
    this.camera.lookAt(0, 0, 0);
    
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
    
    window.addEventListener('resize', this.onResize.bind(this));
  }

  createMap() {
      let geometry;
      this.mapRadius = 40; // Default size (Large Planet)
      
      // 3D Shapes
      switch(this.mapType) {
          case 'circle':
          case 'oval':
          case 'random': // Random sphere?
              geometry = new THREE.SphereGeometry(this.mapRadius, 64, 64);
              break;
          case 'square':
          case 'rectangle':
              // Cube
              geometry = new THREE.BoxGeometry(this.mapRadius * 1.5, this.mapRadius * 1.5, this.mapRadius * 1.5);
              break;
          case 'triangle':
          case 'star': // Star -> Tetrahedron for now
              geometry = new THREE.TetrahedronGeometry(this.mapRadius * 1.5);
              break;
          default:
              geometry = new THREE.SphereGeometry(this.mapRadius, 64, 64);
      }
      
      const material = new THREE.MeshLambertMaterial({ map: this.texture });
      this.mapMesh = new THREE.Mesh(geometry, material);
      this.scene.add(this.mapMesh);
      
      this.mapGeometry = geometry;
  }

  addPlayer(id, color, startQ) {
      const geometry = new THREE.BoxGeometry(2, 2, 2); // Slightly larger player
      const material = new THREE.MeshLambertMaterial({ color: color });
      const mesh = new THREE.Mesh(geometry, material);
      
      this.mapMesh.add(mesh);
      
      this.players[id] = {
          id,
          mesh,
          color,
          quaternion: new THREE.Quaternion(),
          trail: [], // List of {x, y} UV coordinates
          isOutside: false,
          lastUV: null
      };
      
      if (startQ) {
          this.players[id].quaternion.copy(startQ);
          this.updatePlayerVisuals(id);
          
          // Initialize starting territory
          // Ensure matrices are updated for raycasting
          this.mapMesh.updateMatrixWorld(true);
          const uv = this.getUVForPlayer(id);
          if (uv) {
              this.paintAtUV(uv, color, 30); // Start zone
          }
      }
  }

  updatePlayerVisuals(id) {
      const p = this.players[id];
      if (!p) return;
      
      // Ensure world matrix is up to date for raycasting
      this.mapMesh.updateMatrixWorld();
      
      // Calculate desired direction from center based on quaternion (Local Space)
      const localUp = new THREE.Vector3(0, 1, 0);
      const localDir = localUp.applyQuaternion(p.quaternion).normalize();
      
      // Raycast to find surface height
      // Start from far out in Local Space
      const localStartPos = localDir.clone().multiplyScalar(this.mapRadius * 3);
      
      // Convert to World Space for Raycaster
      const worldStartPos = localStartPos.clone().applyMatrix4(this.mapMesh.matrixWorld);
      const worldDir = localDir.clone().transformDirection(this.mapMesh.matrixWorld).negate(); // Towards center
      
      this.raycaster.set(worldStartPos, worldDir);
      const intersects = this.raycaster.intersectObject(this.mapMesh, false);
      
      if (intersects.length > 0) {
          const worldPoint = intersects[0].point;
          // Convert back to Local Space for setting position
          const localPoint = this.mapMesh.worldToLocal(worldPoint.clone());
          
          // Add small offset
          const offset = localDir.clone().multiplyScalar(1.5); 
          p.mesh.position.copy(localPoint).add(offset);
      } else {
          // Fallback
          p.mesh.position.copy(localDir.multiplyScalar(this.mapRadius + 1.5));
      }
      
      p.mesh.quaternion.copy(p.quaternion);
  }

  updatePlayerState(id, q) {
      if (this.players[id]) {
          this.players[id].quaternion.copy(q);
          this.updatePlayerVisuals(id);
          
          // Game Logic: Check UV
          const uv = this.getUVForPlayer(id);
          if (uv) {
              this.handlePlayerLogic(id, uv);
          }
      }
  }
  
  handlePlayerLogic(id, uv) {
      const p = this.players[id];
      
      // Check for seam jumps (wrapping around sphere)
      if (p.lastUV) {
          const dx = Math.abs(uv.x - p.lastUV.x);
          const dy = Math.abs(uv.y - p.lastUV.y);
          if (dx > 0.5 || dy > 0.5) {
              // Jumped seam. Reset lastUV so we don't draw a line across the map
              p.lastUV = uv;
              p.trail.push({ x: uv.x, y: uv.y });
              return;
          }
      }

      // Get color at current position
      const pixelColor = this.getPixelColor(uv);
      const isSelfTerritory = this.colorsMatch(pixelColor, p.color);
      
      if (!p.isOutside) {
          if (!isSelfTerritory && !this.colorsMatch(pixelColor, '#ffffff')) {
              // We just stepped out of our territory (or white/neutral)
              // Actually, in Paper.io, white is neutral.
              // If we are on white, we are "Outside".
              p.isOutside = true;
              p.trail = []; // Start new trail
              p.trail.push({ x: uv.x, y: uv.y });
          } else if (!isSelfTerritory) {
               // On neutral ground
               p.isOutside = true;
               p.trail = [];
               p.trail.push({ x: uv.x, y: uv.y });
          }
      } else {
          // We are outside
          p.trail.push({ x: uv.x, y: uv.y });
          
          // Draw Trail (Visual feedback)
          if (p.lastUV) {
             this.paintTrailSegment(p.lastUV, uv, p.color);
          }
          
          // Check if we returned to self
          if (isSelfTerritory) {
              this.captureTerritory(id);
              p.isOutside = false;
              p.trail = [];
          }
          
          // Check collision with trails (Kill/Die)
          this.checkCollisions(id, uv);
      }
      
      p.lastUV = uv;
  }
  
  checkCollisions(id, headUV) {
      // Check against all players' trails
      const killThreshold = 0.01; // UV distance ~1% of map
      
      Object.keys(this.players).forEach(targetId => {
          const target = this.players[targetId];
          if (target.trail.length < 2) return;
          
          // Iterate segments
          for (let i = 0; i < target.trail.length - 1; i++) {
              const p1 = target.trail[i];
              const p2 = target.trail[i+1];
              
              // Skip the very last segment of OWN trail to avoid immediate self-collision
              if (targetId === id && i === target.trail.length - 2) continue; 
              
              const dist = this.distanceToSegment(headUV, p1, p2);
              
              if (dist < killThreshold) {
                  // Collision!
                  if (targetId === id) {
                      // Suicide
                      this.eliminatePlayer(id);
                  } else {
                      // Kill other
                      this.eliminatePlayer(targetId);
                  }
                  return; // Stop checking
              }
          }
      });
  }
  
  distanceToSegment(p, v, w) {
      const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
      if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
      let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }
  
  eliminatePlayer(id) {
      const p = this.players[id];
      if (!p) return;
      
      console.log(`Eliminating player ${id}`);
      
      // Clear territory
      this.clearTerritory(p.color);
      
      // Remove mesh
      if (p.mesh) {
          if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      }
      
      delete this.players[id];
      
      // Callback if it's me
      if (id === this.myId && this.onGameOver) {
          this.onGameOver();
      }
  }
  
  clearTerritory(colorHex) {
      const imgData = this.ctx.getImageData(0, 0, this.texSize, this.texSize);
      const data = imgData.data;
      
      // Convert hex to rgb
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorHex);
      const rTarget = parseInt(result[1], 16);
      const gTarget = parseInt(result[2], 16);
      const bTarget = parseInt(result[3], 16);
      const tol = 10;
      
      for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          
          if (Math.abs(r - rTarget) < tol && 
              Math.abs(g - gTarget) < tol && 
              Math.abs(b - bTarget) < tol) {
              
              // Set to white
              data[i] = 255;
              data[i+1] = 255;
              data[i+2] = 255;
              data[i+3] = 255;
          }
      }
      
      this.ctx.putImageData(imgData, 0, 0);
      this.texture.needsUpdate = true;
  }

  paintTrailSegment(uv1, uv2, color) {
      const x1 = uv1.x * this.texSize;
      const y1 = (1 - uv1.y) * this.texSize;
      const x2 = uv2.x * this.texSize;
      const y2 = (1 - uv2.y) * this.texSize;
      
      this.ctx.strokeStyle = color; // Maybe lighter?
      this.ctx.lineWidth = 10;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
      this.texture.needsUpdate = true;
  }
  
  captureTerritory(id) {
      const p = this.players[id];
      if (p.trail.length < 3) return;
      
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      
      // Move to first point
      const start = p.trail[0];
      this.ctx.moveTo(start.x * this.texSize, (1 - start.y) * this.texSize);
      
      for (let i = 1; i < p.trail.length; i++) {
          const pt = p.trail[i];
          // Handle seam jumps in drawing?
          // If we handled them in logic, the trail array might have gaps?
          // For now, assume simple polygon
          this.ctx.lineTo(pt.x * this.texSize, (1 - pt.y) * this.texSize);
      }
      
      this.ctx.closePath();
      this.ctx.fill();
      this.texture.needsUpdate = true;
  }
  
  getPixelColor(uv) {
      const x = Math.floor(uv.x * this.texSize);
      const y = Math.floor((1 - uv.y) * this.texSize);
      const data = this.ctx.getImageData(x, y, 1, 1).data;
      return `rgba(${data[0]},${data[1]},${data[2]},${data[3]/255})`; // Approximation
  }
  
  colorsMatch(c1, c2) {
      // c1 is rgba string or hex?
      // c2 is hex string (e.g. #ff0000)
      // We need robust comparison.
      // Let's store colors as Hex in logic.
      // Canvas returns RGBA.
      
      // Helper to parse hex
      const hexToRgb = (hex) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16)
          } : null;
      };
      
      // Parse c1 (rgba(r,g,b,a))
      const rgbValues = c1.match(/\d+/g);
      if (!rgbValues) return false; // white/transparent
      
      const r1 = parseInt(rgbValues[0]);
      const g1 = parseInt(rgbValues[1]);
      const b1 = parseInt(rgbValues[2]);
      
      if (c2 === '#ffffff') {
          return (r1 > 240 && g1 > 240 && b1 > 240);
      }
      
      const rgb2 = hexToRgb(c2);
      if (!rgb2) return false;
      
      // Tolerance
      const tol = 10;
      return (Math.abs(r1 - rgb2.r) < tol && 
              Math.abs(g1 - rgb2.g) < tol && 
              Math.abs(b1 - rgb2.b) < tol);
  }

  animate() {
    requestAnimationFrame(this.animate);
    
    if (this.myId && this.players[this.myId]) {
        // Rotate Map so My Player is at (0, 10, 0)
        const myQ = this.players[this.myId].quaternion.clone();
        const inverse = myQ.invert();
        
        this.mapMesh.setRotationFromQuaternion(inverse);
    }
    
    this.renderer.render(this.scene, this.camera);
  }

  // Texture Painting Helper
  paintAtUV(uv, color, radius=5) {
      const x = Math.floor(uv.x * this.texSize);
      const y = Math.floor((1 - uv.y) * this.texSize); // UV y is bottom-up, Canvas top-down
      
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.texture.needsUpdate = true;
  }
  
  // Get UV under player
  getUVForPlayer(id) {
      const p = this.players[id];
      if (!p) return null;
      
      this.mapMesh.updateMatrixWorld();
      
      // Local Space
      // p.mesh.position is already snapped to surface + offset by updatePlayerVisuals
      // We want to raycast from outside towards center to get the UV on surface
      const localPos = p.mesh.position.clone();
      
      // Start slightly further out than the player mesh
      const localStart = localPos.clone().normalize().multiplyScalar(this.mapRadius * 2);
      const localDir = localPos.clone().normalize().negate(); // Towards center
      
      // World Space
      const worldStart = localStart.clone().applyMatrix4(this.mapMesh.matrixWorld);
      const worldDir = localDir.clone().transformDirection(this.mapMesh.matrixWorld);
      
      this.raycaster.set(worldStart, worldDir);
      const intersects = this.raycaster.intersectObject(this.mapMesh, false);
      
      if (intersects.length > 0) {
          return intersects[0].uv;
      }
      return null;
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  dispose() {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
  }
}
