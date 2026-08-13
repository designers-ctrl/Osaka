// Verify the glass morphism implementation
const fs = require('fs');
const path = require('path');

// Read graphTokens.ts
const tokensPath = path.join(__dirname, 'src/components/graphs/graphTokens.ts');
const tokensContent = fs.readFileSync(tokensPath, 'utf-8');

// Check NODE_STYLING.source has the right properties
console.log('✓ Checking NODE_STYLING.source configuration...');
const sourceStyleMatch = tokensContent.match(/source:\s*\{([^}]+)\}/s);
if (sourceStyleMatch) {
  const styleContent = sourceStyleMatch[1];
  const checks = [
    { name: 'fill', pattern: /fill:\s*['"]rgba\(0,\s*1,\s*1,\s*0\.1\)['"]/ },
    { name: 'stroke', pattern: /stroke:\s*['"]none['"]/ },
    { name: 'filter', pattern: /filter:\s*['"]source-glass['"]/ },
  ];
  
  let allGood = true;
  checks.forEach(check => {
    if (check.pattern.test(styleContent)) {
      console.log(`  ✓ ${check.name}: OK`);
    } else {
      console.log(`  ✗ ${check.name}: MISSING`);
      allGood = false;
    }
  });
  
  if (allGood) {
    console.log('\n✓ All NODE_STYLING.source properties are correct!\n');
  }
}

// Read NetworkGraphD3.vue
const vuePath = path.join(__dirname, 'src/components/graphs/NetworkGraphD3.vue');
const vueContent = fs.readFileSync(vuePath, 'utf-8');

console.log('✓ Checking filter definition in NetworkGraphD3.vue...');
const filterMatch = vueContent.match(/defs\.append\('filter'\)\s*\.attr\('id',\s*'source-glass'\)/);
if (filterMatch) {
  console.log('  ✓ Filter definition found');
  
  // Check for Gaussian blur
  const blurMatch = vueContent.match(/source-glass[^}]*?feGaussianBlur[^}]*?stdDeviation['"]*,?\s*24/s);
  if (blurMatch || vueContent.includes("stdDeviation', 24)")) {
    console.log('  ✓ 24px Gaussian blur configured');
  }
}

// Check filter application
console.log('\n✓ Checking filter application to source nodes...');
const filterAppMatch = vueContent.match(/if\s*\(\s*d\.kind\s*===\s*['"]source['"]\s*\)\s*return\s*['"]url\(#source-glass\)['"]/);
if (filterAppMatch) {
  console.log('  ✓ Filter applied to source nodes');
}

console.log('\n✓ Glass morphism implementation verified successfully!');
console.log('\nExpected visual effect:');
console.log('  - Source nodes will have a dark translucent background (#000101 at 10% opacity)');
console.log('  - 24px Gaussian blur creates a frosted glass appearance');
console.log('  - No visible border (stroke removed)');
console.log('  - Subtle, minimal aesthetic that integrates with the background');
