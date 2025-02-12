// Set up study area
var karnataka = ee.FeatureCollection('FAO/GAUL/2015/level1')
  .filter(ee.Filter.eq('ADM1_NAME', 'Karnataka'));

// List of cities to analyze
var cities = [
  { name: 'Bangalore Urban', state: 'Karnataka' },
  { name: 'Chennai', state: 'Tamil Nadu' },
  { name: 'Pune', state: 'Maharashtra' },
  { name: 'Mumbai', state: 'Maharashtra' },
  { name: 'Kolkata', state: 'West Bengal' },
  { name: 'Delhi', state: 'Delhi' },
  { name: 'Cochin', state: 'Kerala' },
  { name: 'Ahmedabad', state: 'Gujarat' }
];

// Time period
var startDate = '2023-01-01';
var endDate = '2023-12-31';

// Function to mask clouds in LST data
function maskClouds(image) {
  var qa = image.select('QC');
  var mask = qa.bitwiseAnd(1).eq(0);
  return image.updateMask(mask);
}

// Get daytime LST data
var daytimeLST = ee.ImageCollection('MODIS/061/MOD21A1D')
  .filterDate(startDate, endDate)
  .map(maskClouds)
  .select('LST_1KM');

// Get nighttime LST data
var nighttimeLST = ee.ImageCollection('MODIS/061/MOD21A1N')
  .filterDate(startDate, endDate)
  .map(maskClouds)
  .select('LST_1KM');

// Get NDVI data
var ndvi = ee.ImageCollection('MODIS/061/MOD13Q1')
  .filterDate(startDate, endDate)
  .select('NDVI');

// Get land cover data
var landcover = ee.Image('ESA/WorldCover/v200/2021');

// Calculate mean temperatures
var meanDayLST = daytimeLST.mean();
var meanNightLST = nighttimeLST.mean();
var meanNDVI = ndvi.mean();

// Function to calculate UHI for a given city
function calculateUHI(city) {
  var cityFeature = ee.FeatureCollection('FAO/GAUL/2015/level2')
    .filter(ee.Filter.eq('ADM2_NAME', city.name))
    .filter(ee.Filter.eq('ADM1_NAME', city.state));
  
  var stateFeature = ee.FeatureCollection('FAO/GAUL/2015/level1')
    .filter(ee.Filter.eq('ADM1_NAME', city.state));
  
  // Check if city and state features are valid
  if (cityFeature.size().getInfo() === 0) {
    print('City not found:', city.name, city.state);
    return null;
  }
  if (stateFeature.size().getInfo() === 0) {
    print('State not found:', city.state);
    return null;
  }
  
  var cityGeometry = cityFeature.geometry();
  var stateGeometry = stateFeature.geometry();
  var stateWithoutCity = stateGeometry.difference(cityGeometry);
  
  // Calculate city temperature
  var cityDayLST = meanDayLST.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: cityGeometry,
    scale: 1000,
    maxPixels: 1e9
  });
  var cityTemp = ee.Number(cityDayLST.get('LST_1KM'));
  if (cityTemp === null) {
    print('No temperature data for city:', city.name);
    return null;
  }
  cityTemp = cityTemp.multiply(0.02);
  
  // Calculate state temperature
  var stateDayLST = meanDayLST.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: stateWithoutCity,
    scale: 1000,
    maxPixels: 1e9
  });
  var stateTemp = ee.Number(stateDayLST.get('LST_1KM'));
  if (stateTemp === null) {
    print('No temperature data for state:', city.state);
    return null;
  }
  stateTemp = stateTemp.multiply(0.02);
  
  // Calculate UHI intensity
  var uhiIntensity = cityTemp.subtract(stateTemp);
  
  // Calculate urban fraction
  var urbanAreas = landcover.eq(50);
  var urbanFraction = urbanAreas.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: cityGeometry,
    scale: 1000,
    maxPixels: 1e9
  }).get('Map');
  if (urbanFraction === null) {
    print('No urban fraction data for city:', city.name);
    return null;
  }
  
  // Calculate NDVI weight
  var ndviWeight = meanNDVI.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: cityGeometry,
    scale: 250,
    maxPixels: 1e9
  }).get('NDVI');
  if (ndviWeight === null) {
    print('No NDVI data for city:', city.name);
    return null;
  }
  
  // Calculate UHI index
  var uhiIndex = uhiIntensity
    .multiply(ee.Number(urbanFraction))
    .multiply(ee.Number(1).subtract(ee.Number(ndviWeight).divide(10000)));
  
  // Print results
  print('City:', city.name);
  print('City Temperature:', cityTemp);
  print('State Temperature:', stateTemp);
  print('Urban Fraction:', urbanFraction);
  print('NDVI Weight:', ndviWeight);
  print('Urban Heat Island Index:', uhiIndex);
  
  return uhiIndex;
}

// Iterate over each city and calculate UHI
cities.forEach(function(city) {
  calculateUHI(city);
});
