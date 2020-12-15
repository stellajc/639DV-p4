const urls = {
  map: "states-albers-10m.json",
  airports:
    "data/airportdelay.csv",
  flights:
    "data/top50_1125.csv",

  comps: 'data/comp.csv',

  allairport: 'data/airport.csv'
};


const svg  = d3.select("svg");

const width  = parseInt(svg.attr("width"));
const height = parseInt(svg.attr("height"));
const hypotenuse = Math.sqrt(width * width + height * height);
const projection = d3.geoAlbers().scale(1280).translate([480, 300]);


const scales = {
  // used to scale airport bubbles
  airports: d3.scaleSqrt()
    .range([4, 40]),

  // used to scale number of segments per line
  segments: d3.scaleLinear()
    .domain([0, hypotenuse])
    .range([1, 10])
};

// have these already created for easier drawing
const g = {
  basemap:  svg.select("g#basemap"),
  flights:  svg.select("g#flights"),
  airports: svg.select("g#airports"),
  voronoi:  svg.select("g#voronoi"),
};

console.assert(g.basemap.size()  === 1);
console.assert(g.flights.size()  === 1);
console.assert(g.airports.size() === 1);
console.assert(g.voronoi.size()  === 1);


const tooltip = d3.select("text#tooltip");
console.assert(tooltip.size() === 1);

// load and draw base map
d3.json(urls.map).then(drawMap);


function processData(values) {

  let airports = values[0];
  let flights  = values[1];
  let yearData = values[2];
  let hourData = values[3];
  let isLineShow = values[4];
  let isAirplaneShow = values[5];
  let isAirportShow = values[6];
  let arrivalShow = values[7];
  let isDelayCount = values[8];
  let airplaneCompany = values[9];
  let selectedDepartureAirport = values[10];
  let selectedArrivalAirport = values[11];
  let selectedCompany = values[12];
  let allairport = values[13];

  flights = flights.filter(flight => flight.FL_DATE == yearData);
   if (hourData%2 == 0){
    flights = flights.filter(flight => flight.ARR_TIME >= hourData*50 && flight.DEP_TIME <= hourData*50);
  }
  else{
    flights = flights.filter(flight => flight.ARR_TIME >= hourData*50-20 && flight.DEP_TIME <= hourData*50-20);
  }
  // convert airports array (pre filter) into map for fast lookup
  let iata = new Map(allairport.map(node => [node.airport, node]));


  // reset map to only include airports post-filter
  // airplaneCompany
  if(selectedDepartureAirport!='all'){
    flights = flights.filter(flight => flight.ORIGIN == selectedDepartureAirport);
  }
  if(selectedArrivalAirport!='all'){
    flights = flights.filter(flight => flight.DEST == selectedArrivalAirport);
  }

  if(selectedCompany!='all'){
    flights = flights.filter(flight => flight.OP_CARRIER == selectedCompany);
  }

  // calculate incoming and outgoing degree based on flights
  // flights are given by airport iata code (not index)
  flights.forEach(function(link) {
    link.source = iata.get(link.ORIGIN);
    link.target = iata.get(link.DEST);
    // link.source.outgoing += link.count;
    // link.target.incoming += link.count;
  });



  // filter out flights that are not between airports we have leftover

  flights = flights.filter(link => iata.has(link.source.airport) && iata.has(link.target.airport));

  
   airports = airports.filter(airports => airports.time == hourData && airports.year == yearData);
  if (arrivalShow == false && isDelayCount == '0'){
      airports.forEach(function(link){
      link.outgoing = link.arrcount;});
  }else if (arrivalShow == true && isDelayCount== '0'){
      airports.forEach(function(link){
      link.outgoing = link.depcount;});
  }else if (arrivalShow == false && isDelayCount == '1'){
      airports.forEach(function(link){
      link.outgoing = link.arrsum;});
  }else {
      airports.forEach(function(link){
      link.outgoing = link.depsum;});
  }

  if (isAirportShow ==true) {
    g.airports.selectAll("circle.simple").remove();
    drawAirports(airports);
  } else{
    g.airports.selectAll("circle.airport").remove();
    drawPoints(airports);
    svg.selectAll("text.re").remove();
    svg.selectAll("circle.re").remove();
    svg.selectAll("line.re").remove();
    // svg.selectAll("legend").remove();
    // svg.selectAll("legend line").remove();

  }
  // done filtering flights can draw
  if (isLineShow == true) {
    w_drawFlights(allairport, flights);
  }else{
    g.flights.selectAll('line').remove();
  }

  // draw airplanes
  if (isAirplaneShow ==true) {
    w_drawAirplanes(allairport, flights, hourData);
  }else{
    g.flights.selectAll('text').remove();
  }
}


// draws the underlying map
function drawMap(map) {
  // remove non-continental states
  map.objects.states.geometries = map.objects.states.geometries.filter(isContinental);

  // run topojson on remaining states and adjust projection
  let land = topojson.merge(map, map.objects.states.geometries);

  // use null projection; data is already projected
  let path = d3.geoPath();

  // draw base map
  g.basemap.append("path")
    .datum(land)
    .attr("class", "land")
    .attr("d", path);
  // draw interior borders
  g.basemap.append("path")
    .datum(topojson.mesh(map, map.objects.states, (a, b) => a !== b))
    .attr("class", "border interior")
    .style('stroke','#202020')
    .attr("d", path);

  // draw exterior borders
  g.basemap.append("path")
    .datum(topojson.mesh(map, map.objects.states, (a, b) => a === b))
    .style('stroke','#202020')
    .attr("class", "border exterior")
    .attr("d", path);
}

function drawPoints(airports) {
  g.airports.selectAll("circle.simple")
    .data(airports, d => d.iata)
    .enter()
    .append("circle")
    .attr("cx", d => d.x) // calculated on load
    .attr("cy", d => d.y) // calculated on load
    .attr("r", "4px")
    .attr("fill", "black")
    .attr("class", "simple")
}

function drawAirports(airports) {
  // adjust scale
  const extent = d3.extent(airports, d => d.outgoing);
  scales.airports.domain(extent);
  // remove previous layer
  g.airports.selectAll("circle.airport").remove();
  d3.select("svg").selectAll("text.re").remove();
  d3.select("svg").selectAll("circle.re").remove();
  d3.select("svg").selectAll("line.re").remove();
  // draw airport bubbles
  g.airports.selectAll("circle.airport")
    .data(airports, d => d.iata)
    .enter()
    .append("circle")
    .attr("r",  d => scales.airports(d.outgoing))
    .attr("cx", d => d.x) // calculated on load
    .attr("cy", d => d.y) // calculated on load
    .attr("class", "airport")
    .each(function(d) {
      // adds the circle object to our airport
      // makes it fast to select airports on hover
      d.bubble = this;
    });
    let num = 1;
    let bubblesize = [0];
    
    airports.forEach(function(link){
        bubblesize[num] = link.outgoing;
        num = num + 1;});
     Nmin = Math.min.apply(Math, bubblesize);
     Nmax = Math.max.apply(Math, bubblesize);

var svg = d3.select("svg")
  .append("g")
    .attr("transform", "translate(50, 500)");

// The scale you use for bubble size
var size = d3.scaleSqrt()
  .domain([Nmin, Nmax])  // What's in the data, let's say it is percentage
  .range([4, 40])  // Size in pixel

// Add legend: circles
var values = [Nmin, Nmax/2 + Nmin/2, Nmax]
var xCircle = 10
var xLabel = 40
var yCircle = 40
valuesToShow = values.sort(function(a,b) { return +size(b) - +size(a) })

svg.selectAll("legend")
  .data(valuesToShow)
  .enter()
  .append("circle")
    .attr("cx", xCircle)
    .attr("cy", function(d){ return yCircle - size(d) } )
    .attr("r", function(d){ return size(d) })
    .style("fill", "white")
    .attr("stroke", "#202020")
    .attr('stroke-width', '1')
    .attr("class", "re")

// Add legend: segments
svg.selectAll("legend")
  .data(valuesToShow)
  .enter()
  .append("line")
    .attr('x1', function(d){ return xCircle + size(d) } )
    .attr('x2', function(d){ return xLabel+ 2*size(d) })
    .attr('y1', function(d){ return yCircle - size(d) } )
    .attr('y2', function(d){ return yCircle - size(d) } )
    .attr('stroke', '#888888')
    .attr('stroke-width', '2')
    .style('stroke-dasharray', ('2,2'))
    .attr("class", "re")

// Add legend: labels
svg.selectAll("legend")
  .data(valuesToShow)
  .enter()
  .append("text")
    .attr('x', function(d){ return xLabel+ 2*size(d) })
    .attr('y', function(d){ return yCircle - size(d) } )
    .text( function(d){ return d } )
    .style("font-size", 14)
    .style('fill','#C0C0C0')
    .attr('alignment-baseline', 'middle')
    .attr("class", "re")
    const geojson = airports.map(function(airport) {
     return {
       type: "Feature",
       properties: airport,
       geometry: {
         type: "Point",
         coordinates: [airport.longitude, airport.latitude]
       }
     };
   });
  

//   show airport name
   const polygons = d3.geoVoronoi().polygons(geojson);
      g.voronoi.selectAll("path")
        .data(polygons.features)
        .enter()
        .append("path")
        .attr("d", d3.geoPath(projection))
        .attr("class", "voronoi")
        .on("mouseover", function(d) {
      let airport = d.properties.site.properties;

      
      g.flights.selectAll('line')
      .each(function(d){
        x1 = d3.select(this).attr('x1');
        x2 = d3.select(this).attr('x2');
        x1 = parseFloat(x1);
        x2 = parseFloat(x2);
        
        if (x1 ==airport.x || x2 == airport.x){
          d3.select(this)
          .attr('class', "Y")
          .attr("stroke-width", 5)
          .attr("stroke", "#df861d");
        }else{
          d3.select(this)
          .attr('class', "N");
        }
      });

      d3.select(airport.bubble)
        .classed("highlight", true);

       tooltip.style("display", null);
       tooltip.style("visibility", "hidden");

       // set default tooltip positioning
       tooltip.attr("text-anchor", "middle");
       tooltip.attr("dy", -scales.airports(airport.outgoing) - 4);
       tooltip.attr("x", airport.x);
       tooltip.attr("y", airport.y);

       // set the tooltip text
       tooltip.text(airport.name);
       
    // double check if the anchor needs to be changed
       let bbox = tooltip.node().getBBox();

       if (bbox.x <= 0) {
         tooltip.attr("text-anchor", "start");
       }
       else if (bbox.x + bbox.width >= width) {
         tooltip.attr("text-anchor", "end");
       }

       tooltip.style("visibility", "visible");
     })
     .on("mouseout", function(d) {
       let airport = d.properties.site.properties;

       d3.select(airport.bubble)
         .classed("highlight", false);
       g.flights.selectAll('line')
       .each(function(d){
          d3.select(this)
          .attr("stroke-width", 1)
          .attr("stroke", "white");
      });


       d3.select("text#tooltip").style("visibility", "hidden");
     });
}


function drawFlights(airports, flights) {
  // break each flight between airports into multiple segments
  let bundle = generateSegments(airports, flights);
  let line = d3.line()
    .curve(d3.curveBundle)
    .x(airport => airport.x)
    .y(airport => airport.y);

  let links = g.flights.selectAll("path.flight")
    .data(bundle.paths)
    .enter()
    .append("path")
    .attr("d", line)
    .attr("class", "flight")

  let layout = d3.forceSimulation()
    // settle at a layout faster
    .alphaDecay(0.1)
    // nearby nodes attract each other
    .force("charge", d3.forceManyBody()
      .strength(10)
      .distanceMax(scales.airports.range()[1] * 2)
    )
    // edges want to be as short as possible
    // prevents too much stretching
    .force("link", d3.forceLink()
      .strength(0.7)
      .distance(0)
    )
    .on("tick", function(d) {
      links.attr("d", line);
    })
    .on("end", function(d) {
      console.log("layout complete");
    });

  layout.nodes(bundle.nodes).force("link").links(bundle.links);
}


// Turns a single edge into several segments that can
// be used for simple edge bundling.
function generateSegments(nodes, links) {
  // generate separate graph for edge bundling
  // nodes: all nodes including control nodes
  // links: all individual segments (source to target)
  // paths: all segments combined into single path for drawing
  let bundle = {nodes: [], links: [], paths: []};

  // make existing nodes fixed
  bundle.nodes = nodes.map(function(d, i) {
    d.fx = d.x;
    d.fy = d.y;
    return d;
  });

  links.forEach(function(d, i) {
    // calculate the distance between the source and target
    let length = distance(d.source, d.target);

    // calculate total number of inner nodes for this link
    let total = Math.round(scales.segments(length));

    // create scales from source to target
    let xscale = d3.scaleLinear()
      .domain([0, total + 1]) // source, inner nodes, target
      .range([d.source.x, d.target.x]);

    let yscale = d3.scaleLinear()
      .domain([0, total + 1])
      .range([d.source.y, d.target.y]);

    // initialize source node
    let source = d.source;
    let target = null;

    // add all points to local path
    let local = [source];

    for (let j = 1; j <= total; j++) {
      // calculate target node
      target = {
        x: xscale(j),
        y: yscale(j)
      };

      local.push(target);
      bundle.nodes.push(target);

      bundle.links.push({
        source: source,
        target: target
      });

      source = target;
    }

    local.push(d.target);

    // add last link to target node
    bundle.links.push({
      source: target,
      target: d.target
    });

    bundle.paths.push(local);
  });

  return bundle;
}

// determines which states belong to the continental united states
// https://gist.github.com/mbostock/4090846#file-us-state-names-tsv
function isContinental(state) {
  const id = parseInt(state.id);
  return id < 60 && id !== 2 && id !== 15;
}

// see airports.csv
// convert gps coordinates to number and init degree
function typeAirport(airport) {
  airport.longitude = parseFloat(airport.longitude);
  airport.latitude  = parseFloat(airport.latitude);
  airport.arrcount = parseInt(airport.arrcount);
  airport.depcount = parseInt(airport.depcount);
  airport.depsum = parseInt(airport.depsum);
  airport.arrsum = parseInt(airport.arrsum);
  airport.time = parseInt(airport.time);
  airport.year = parseFloat(airport.year);
  // use projection hard-coded to match topojson data
  const coords = projection([airport.longitude, airport.latitude]);
  airport.x = coords[0];
  airport.y = coords[1];
  airport.r = 0;
  airport.outgoing = 0;
  airport.flights = [];  // eventually tracks outgoing flights
  return airport;
}
function typeFlight(flight) {
  flight.DEP_TIME = parseInt(flight.DEP_TIME);
  flight.ARR_TIME = parseInt(flight.ARR_TIME);
  flight.FL_DATE = parseInt(flight.FL_DATE);
  return flight;
}

function typeCompanys(comp) {
  return {
    companyName: comp.op
  };
}

function typeAllairport(allairport) {
  allairport.longitude = parseFloat(allairport.longitude);
  allairport.latitude  = parseFloat(allairport.latitude);
  const coords = projection([allairport.longitude, allairport.latitude]);
  allairport.x = coords[0];
  allairport.y = coords[1];
  return allairport;
}

// calculates the distance between two nodes
// sqrt( (x2 - x1)^2 + (y2 - y1)^2 )
function distance(source, target) {
  const dx2 = Math.pow(target.x - source.x, 2);
  const dy2 = Math.pow(target.y - source.y, 2);

  return Math.sqrt(dx2 + dy2);
}


function w_drawFlights(airports, flights) {
  // console.log("airports:", airports)
  g.flights.selectAll('line').remove();
  

  for (let flight of flights){
    AP_ORI = airports.find(o => o.airport === flight.ORIGIN)
    // console.log("flight.ORIGIN", flight.ORIGIN)
    AP_DES = airports.find(o => o.airport === flight.DEST)
    // console.log("flight.DEST", flight.DEST)
    g.flights.append("line")
      // .data(flights)
      .attr("x1", AP_ORI.x)
      .attr("x2", AP_DES.x)
      .attr("y1", AP_ORI.y)
      .attr("y2", AP_DES.y)
      .attr("stroke-width", 1)
      .attr("stroke", "white")
  }

}

function w_drawAirplanes(airports, flights, hourData){

  var current_time = parseInt(hourData/2)*100+parseInt(hourData%2)*30
  g.flights.selectAll('text').remove();
  for (let flight of flights){
    AP_ORI = airports.find(o => o.airport === flight.ORIGIN)
    AP_DES = airports.find(o => o.airport === flight.DEST)
    DEGREE = Math.atan((AP_DES.y - AP_ORI.y) / (AP_DES.x - AP_ORI.x)) / Math.PI * 180
    if ((AP_DES.x - AP_ORI.x) < 0){
      DEGREE = 180 + DEGREE
    }

    TOTAL_MIN = time_distance_min(flight.DEP_TIME, flight.ARR_TIME)
    PAST_MIN = time_distance_min(flight.DEP_TIME, current_time)
    RATIO = PAST_MIN/TOTAL_MIN

    AC_x = AP_ORI.x + (AP_DES.x - AP_ORI.x)*RATIO
    AC_y = AP_ORI.y + (AP_DES.y - AP_ORI.y)*RATIO

    g.flights.append("text")
      // .data(flights)
      .attr("x", AC_x)
      .attr("y", AC_y)
      .style("font-size", "40")
      .attr("dy", "15px")
      .attr("dx", "-15px")
      .text("\u2708")
      .attr("transform", "rotate("+DEGREE+","+AC_x+","+AC_y+")")
  }
}

function time_distance_min(start_time, end_time){
  start_hour = parseInt(start_time/100)
  start_min = parseInt(start_time%100)
  end_hour = parseInt(end_time/100)
  end_min = parseInt(end_time%100)
  return (end_hour-start_hour)*60+(end_min-start_min)   
}
