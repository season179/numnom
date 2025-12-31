/**
 * Generate NumNom icon - a playful pac-man style character eating numbers
 * Run with: bun run scripts/generate-icon.ts
 */

import { writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';

const SIZE = 128;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');

// Clear background (transparent)
ctx.clearRect(0, 0, SIZE, SIZE);

// Main colors
const mainGreen = '#4CAF50'; // Friendly green
const darkGreen = '#388E3C'; // Darker shade for depth
const lightGreen = '#81C784'; // Highlight
const eyeWhite = '#FFFFFF';
const eyePupil = '#1B5E20';

// Center point
const cx = SIZE / 2;
const cy = SIZE / 2;
const radius = SIZE * 0.42;

// Draw shadow/depth layer
ctx.beginPath();
ctx.arc(cx + 2, cy + 2, radius, 0.2 * Math.PI, 1.8 * Math.PI);
ctx.lineTo(cx + 2, cy + 2);
ctx.closePath();
ctx.fillStyle = darkGreen;
ctx.fill();

// Draw main pac-man body
ctx.beginPath();
ctx.arc(cx, cy, radius, 0.2 * Math.PI, 1.8 * Math.PI);
ctx.lineTo(cx, cy);
ctx.closePath();

// Create gradient for the body
const gradient = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx, cy, radius);
gradient.addColorStop(0, lightGreen);
gradient.addColorStop(0.5, mainGreen);
gradient.addColorStop(1, darkGreen);
ctx.fillStyle = gradient;
ctx.fill();

// Draw eye
const eyeX = cx - radius * 0.15;
const eyeY = cy - radius * 0.35;
const eyeRadius = radius * 0.18;

// Eye white
ctx.beginPath();
ctx.arc(eyeX, eyeY, eyeRadius, 0, 2 * Math.PI);
ctx.fillStyle = eyeWhite;
ctx.fill();

// Eye pupil
ctx.beginPath();
ctx.arc(eyeX + eyeRadius * 0.2, eyeY, eyeRadius * 0.55, 0, 2 * Math.PI);
ctx.fillStyle = eyePupil;
ctx.fill();

// Eye highlight
ctx.beginPath();
ctx.arc(eyeX - eyeRadius * 0.1, eyeY - eyeRadius * 0.2, eyeRadius * 0.25, 0, 2 * Math.PI);
ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
ctx.fill();

// Draw small numbers being "eaten" in the mouth area
const numColor = '#FFD54F'; // Golden yellow for numbers
ctx.fillStyle = numColor;
ctx.font = 'bold 16px sans-serif';

// Numbers floating toward the mouth
const numbers = [
  { text: '7', x: cx + radius * 0.85, y: cy - 8, size: 14, opacity: 0.9 },
  { text: '3', x: cx + radius * 1.1, y: cy + 5, size: 12, opacity: 0.7 },
  { text: '$', x: cx + radius * 0.95, y: cy + 15, size: 10, opacity: 0.5 },
];

for (const num of numbers) {
  ctx.globalAlpha = num.opacity;
  ctx.font = `bold ${num.size}px sans-serif`;
  ctx.fillStyle = numColor;
  ctx.fillText(num.text, num.x, num.y);
}

ctx.globalAlpha = 1;

// Save the image
const buffer = canvas.toBuffer('image/png');
writeFileSync('./public/icon.png', buffer);

console.log('Icon generated successfully: public/icon.png');
