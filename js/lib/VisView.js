var eb = require("../eventBus");
var owl = require("owl");
var display = require("../util/display");
var Raphael = require("raphael");

// TODO are we using force Layout or not? not really. so it may be worth cleaning up to simplify.
// Use a css animation to transition the position

var VisView = function(params){

var el_selector = params.el;
var el_queryResultSelector = params.el_queryResultSelector;
var el_carouselSelector = params.el_carouselSelector;
var el_raphaelSelector = params.el_raphaelSelector;
var getCommentsForGroup = params.getCommentsForGroup;
var getReactionsToComment = params.getReactionsToComment;
var getUserInfoByPid = params.getUserInfoByPid;
var getTotalVotesByPidSync = params.getTotalVotesByPidSync;
var computeXySpans = params.computeXySpans;
var getPidToBidMapping = params.getPidToBidMapping;

// var getPid = params.getPid;

function getBid(d) {
    return d.bid;
}

var groupTag = "g";

var onSelfAppearsCallbacks = $.Callbacks();
var selfHasAppeared = false;

// The h and w values should be locked at a 1:2 ratio of h to w
var h;
var w;
var nodes = [];
var clusters = [];
var hulls = [];
var visualization;
var main_layer;
var overlay_layer;
//var g; // top level svg group within the vis that gets translated/scaled on zoom
var force;
var queryResults;
var d3Hulls;
var d3CommentList;

var selectedCluster = false;
var selectedBids = [];
var selectedTid = -1;

// number of votes by the participant who has voted the most.
var maxVoteCount = 0;

var eps = 0.000000001;
var SELECT_GLOBAL_CONSENSUS_WHEN_NO_HULL_SELECTED = false;

var bidToGid = {};
var bidToBucket = {};

var SELF_DOT_SHOW_INITIALLY = true;
var selfDotTooltipShow = !SELF_DOT_SHOW_INITIALLY;
var SELF_DOT_HINT_HIDE_AFTER_DELAY = 10*1000;
var selfDotHintText = "This is you";

var isIE8 = navigator.userAgent.match(/MSIE 8/);

// if (isIE8) {
//     $(el_selector).html(
//         "<div class='visualization' style='width:100%;height:100%;'><center>" +
//         "Apologies, the visualization is not available on IE 8.</br>" +
//         "Get the full experience on IE 10+, Chrome, Firefox, or on your iOS / Android browser.</br>" +
//         "</center></div>");
//     return {
//         upsertNode: function() {},
//         emphasizeParticipants: function() {}
//     };
// }

// Tunables

var baseNodeRadiusScaleForGivenVisWidth = d3.scale.linear().range([3, 7]).domain([350, 800]).clamp(true);
var chargeForGivenVisWidth = d3.scale.linear().range([-1, -10]).domain([350, 800]).clamp(true);
var strokeWidthGivenVisWidth = d3.scale.linear().range([0.2, 1.0]).domain([350, 800]).clamp(true);
var colorPull = "#2ecc71"; // EMERALD
var colorPush = "#e74c3c"; // ALIZARIN
var colorPass = "#BDC3C7"; // SILVER
var colorSelf = "#0CF"; // blue - like the 'you are here' in mapping software
var colorNoVote = colorPass;
// var colorSelfOutline = d3.rgb(colorSelf).darker().toString();
// var colorPullOutline = d3.rgb(colorPull).darker().toString();
// var colorPushOutline = d3.rgb(colorPush).darker().toString();

function useCarousel() {
    return display.xs();
}

// Cached results of tunalbes - set during init
var strokeWidth;
var baseNodeRadius;
// Since initialize is called on resize, clear the old vis before setting up the new one.
$(el_selector).html("");

/* d3-tip === d3 tooltips... [[$ bower install --save d3-tip]] api docs avail at https://github.com/Caged/d3-tip */
var tip = null;
var SHOW_TIP = false;
var tipPreviousTarget = null; // Sorry God!
if (SHOW_TIP && !isIE8) {
    $("#ptpt-tip").remove();
    tip = d3.tip().attr("id", "ptpt-tip").attr("stroke", "rgb(52,73,94)").html(
        function(d) {
            d.getPeople().then(function(people) {
                // use the email address as the html
                var html = people.map(function(p) {
                    if (isSelf(d)) {
                        var hint = selfDotTooltipShow ? selfDotHintText : "";
                        return {
                            email: hint
                        };
                    }
                    return p;
                })
                .map(function(p) {
                    if (!p) {
                        console.warn("missing user info");
                        return "";
                    }
                    return p.email;
                }).join("<br/>");
                setTimeout(function() {
                    $("#tipContents").html(html);
                }, 10);
            });
            if (d === tipPreviousTarget) {
                var oldHtml = $("#tipContents").html();
                if (oldHtml) {
                    return oldHtml;
                }
            }
            tipPreviousTarget = d;
            return "<div id='tipContents'></div>";
        }
    );
}
function showTip() {
    if (tip) {
        tip.show.apply(tip, arguments);
    }
}
function hideTip() {
    if (tip) {
        tip.hide.apply(tip, arguments);
    }
}


var dimensions = {
    width: "100%",
    height: "100%"
};

if (isIE8) {
    // R2D3 seems to have trouble with percent values.
    // Hard-coding pixel values for now.
    dimensions = {
        width: "500px",
        height: "300px"
    };
}

var paper = new Raphael($(el_raphaelSelector)[0], dimensions.width, dimensions.height);

var MAX_BUCKETS = 60;
var rNodes = [];
var rBuckets = [];

function makeBucketParts(i) {
    var circleOuter = paper.circle(0,0,0);
    circleOuter.attr('fill', colorNoVote);
    circleOuter.attr('fill-opacity', 0.2);
    circleOuter.attr('stroke-width', 0);

    var circle  = paper.circle(0,0,0);
    circle.attr('fill', colorNoVote);
    circle.attr('stroke-width', 0);

    // colorSelf
    var up = paper.path();
    up.attr('fill', colorPull);
    up.attr('stroke-width', 0);

    var down = paper.path();
    down.attr('fill', colorPush);
    down.attr('stroke-width', 0);


        // .toFront();
    var set = paper.set();
    set.push(circle);
    set.push(circleOuter);
    set.push(up);
    set.push(down);
    var bucket = {
        radius: 0,
        x: 0,
        y: 0,
        circle: circle,
        circleOuter: circleOuter,
        up: up,
        down: down,
        transform: function(x, y) {
            this.x = x;
            this.y = y;
            this.set.transform("");
            this.set.transform("T" + x + "," + y);

            // this.circle.attr("cx", x);
            // this.circle.attr("cy", y);

            // this.circleOuter.attr("cx", x);
            // this.circleOuter.attr("cy", y);

        },
        scaleCircle: function(s) {
            this.circle.attr("r", this.radius * s);
        },
        setUps: function(ups) {
            var path = chooseUpArrowPath2(ups, 0, 0);
            var _transformed = Raphael.transformPath(path,
                'T0,0'); // TODO needed?
            this.up.animate({path: _transformed}, 0);
        },

        setDowns: function(downs) {
            var path = chooseDownArrowPath2(downs, 0, 0);
            var _transformed = Raphael.transformPath(path,
                'T0,0'); // TODO needed?
            this.down.animate({path: _transformed}, 0);
        },
        // arrowUp: arrowUp,
        // arrowUpOuter: arrowUpOuter,
        // arrowDown: arrowDown,
        // arrowDownOuter: arrowDownOuter,        
        set: set
    };

    return bucket;
}

for (var i = 0; i < MAX_BUCKETS; i++) {
    var bucket = makeBucketParts();
    rNodes.push(bucket);
}

$(el_selector)
  .append("<svg xmlns='http://www.w3.org/2000/svg'>" +
    "<defs>" +
        "<marker class='helpArrow' id='ArrowTip'" +
                "viewBox='0 0 10 10'" +
                "refX='1' refY='5'" +
                "markerWidth='5'" +
                "markerHeight='5'" +
                "orient='auto'>" +
            "<path d='M 0 0 L 10 5 L 0 10 z' />" +
        "</marker>" +

        "<filter id='shadowFilter' height='130%' width='130%'>" +
          "<feGaussianBlur in='SourceAlpha' stdDeviation='1'/> <!-- stdDeviation is how much to blur -->" +
          "<feOffset dx='1' dy='1' result='offsetblur'/> <!-- how much to offset -->" +
          // "<feComponentTransfer xmlns='http://www.w3.org/2000/svg'>" +
          //   "<feFuncA type='linear' slope='1'/>" +
          // "</feComponentTransfer>" +
          "<feMerge> " +
            "<feMergeNode/> <!-- this contains the offset blurred image -->" +
            "<feMergeNode in='SourceGraphic'/> <!-- this contains the element that the filter is applied to -->" +
          "</feMerge>" +
        "</filter>" +

        "<filter id='ghostFilter'>" +
          "<feMorphology radius='10' operator='erode'/>" +          
          "<feGaussianBlur stdDeviation='20'/> <!-- stdDeviation is how much to blur -->" +
          // "<feMorphology radius='10' in='SourceAlpha' out='edge' operator='dilate'/>" +
        "</filter>" +

    "</defs>" +
    "</svg>")
  ;

  setTimeout(function() {
      $(el_selector).append(
        "<div id='helpTextBox' class='unselectable hidden'>" +
            "<button type='button' class='close' aria-hidden='true'>&times;</button>" +
            "<span id='helpTextMessage'></span>" +
            "</div>")
      .on("click", onHelpTextClicked);
    }, 100);

//create svg, appended to a div with the id #visualization_div, w and h values to be computed by jquery later
//to connect viz to responsive layout if desired
visualization = d3.select(el_selector).select("svg")
      .call( tip || function(){} ) /* initialize d3-tip */
      // .attr("width", "100%")
      // .attr("height", "100%")
      .attr(dimensions)
      // .attr("viewBox", "0 0 " + w + " " + h )
      .classed("visualization", true)
        .append(groupTag)
            // .call(d3.behavior.zoom().scaleExtent([1, 8]).on("zoom", zoom))
;
$(el_selector).on("click", selectBackground);

main_layer = visualization.append(groupTag);
overlay_layer = visualization.append(groupTag);

overlay_layer.append("polyline")
    .classed("helpArrow", true)
    .classed("helpArrowLine", true)
    .style("display", "none")
    ;


// function zoom() {
//   // TODO what is event?
//   visualization.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
// }

window.vis = visualization; // TODO why? may prevent GC
w = $(el_selector).width();
h = $(el_selector).height();

strokeWidth = strokeWidthGivenVisWidth(w);
baseNodeRadius = baseNodeRadiusScaleForGivenVisWidth(w);
charge = chargeForGivenVisWidth(w);

if (!useCarousel()) {
    queryResults = d3.select(el_queryResultSelector).html("")
        .append("ol")
        .classed("query_results", true);
}

$(el_queryResultSelector).hide();
// $(el_carouselSelector).hide();

    //$(el_selector).prepend($($("#pca_vis_overlays_template").html()));

force = d3.layout.force()
    .nodes(nodes)
    .links([])
    .friction(0.9) // more like viscosity [0,1], defaults to 0.9
    .gravity(0)
    .charge(charge) // slight overlap allowed
    .size([w, h]);

// function zoomToHull(d){

//     var b = bounds[d.hullId];
//     visualization.transition().duration(750)
//     //.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
//     .attr("transform", "" + "scale(" + 0.95 / Math.max((b[1][0] - b[0][0]) / w, (b[1][1] - b[0][1]) / h) + ")" + "translate(" + -(b[1][0] + b[0][0]) / 2 + "," + -(b[1][1] + b[0][1]) / 2 + ")");
//     //visualization.attr("transform", "translate(10,10)scale(" + d3.event.scale + ")");
// }


// compute how somilar the membership vectors are between two clusters.
// similarity = (bothHave+1) / (longerArray.length + 1)
function clusterSimilarity(a, b) {

// clusters [[2,3,4],[1,5]]
    var longerLength = Math.max(a.length, b.length);
    var ai = 0;
    var bi = 0;
    var bothHave = 0;

    while (ai < a.length) {

        if (bi >= b.length) {
            break;
        }
        var aa = a[ai];
        var bb = b[bi];
        if (aa === bb) {
            bothHave += 1;
            ai += 1;
            bi += 1;
        }
        else if (aa > bb){
            bi += 1;
        }
        else if (bb > aa) {
            ai += 1;
        }
    }

    return (bothHave + 1) / (longerLength + 1);
}

console.log("expect: " + (3/5));
console.log(clusterSimilarity([2,3,4], [2,4,7,8]));


function argMax(f, args) {
    var max = -Infinity;
    var maxArg = null;
    _.each(args, function(arg) {
        var val = f(arg);
        if (val > max) {
            max = val;
            maxArg = arg;
        }
    });
    return maxArg;
}

function setClusterActive(clusterId) {
    var pids;
    var promise;
    if (clusterId === false) {
        pids = [];
        promise = $.Deferred().resolve([]);
    } else {
        pids = clusters[clusterId];
        var NUMBER_OF_REPRESENTATIVE_COMMENTS_TO_SHOW = 3;
        promise = getCommentsForGroup(clusterId, NUMBER_OF_REPRESENTATIVE_COMMENTS_TO_SHOW);
    }
    selectedCluster = clusterId;

    promise
      .pipe( // getCommentsForSelection with clusters array (of pids)
        renderComments,                                 // !! this is tightly coupled.
                            // !! it makes sense to keep this in the view because
                                                        // !! we have to come BACK to the viz from the
                                                        // !! backbonified list, then. Not worth it?
        function(err) {
          console.error(err);
          resetSelection();
        })
      //.done(unhoverAll)
      ;
    
    // duplicated at 938457938475438975
    main_layer.selectAll(".active").classed("active", false);

    // d3.select(this)
    //     .style("fill","lightgreen")
    //     .style("stroke","lightgreen");

    return promise;
}

function updateHullColors() {
    if (selectedCluster !== false) {
       d3.select(d3Hulls[selectedCluster][0][0]).classed("active", true);
       for (var i = 0; i < raphaelHulls.length; i++) {
            if (i === selectedCluster) {
              raphaelHulls[i]
                .attr('fill', hull_selected_color)
                .attr('stroke', hull_selected_color);
            } else {
              raphaelHulls[i]
                .attr('fill', hull_unselected_color)
                .attr('stroke', hull_unselected_color);
            }
        }
    }
}

function onClusterClicked(d) {
    $("#analyzeTab").tab("show");
    eb.trigger("clusterClicked");
    return handleOnClusterClicked(d.hullId);
}

function handleOnClusterClicked(hullId) {
    if (selectedCluster === hullId) {                 // if the cluster/hull just selected was already selected...
      return resetSelection();
    } else {
        resetSelectedComment();
        unhoverAll();
        setClusterActive(hullId)
            .then(
                updateHulls,
                updateHulls);

        updateHullColors();
    }

    //zoomToHull.call(this, d);
    if (d3.event.stopPropagation) {
        d3.event.stopPropagation();
    }
    if (d3.event.preventDefault) {
        d3.event.preventDefault(); // prevent flashing on iOS
    }
}

d3Hulls = _.times(9, function(i) {
    return main_layer.append("path")
        .classed("hull", true)
        .classed("svgShadow", function() {
            return !/Firefox/.exec(navigator.userAgent);
        })
        .on("click", onClusterClicked)  //selection-results:1 handle the click event
        .attr("gid", i)
    ;
});
var hull_unselected_color = '#f6f6f6';
var hull_selected_color = '#ebf3ff';
raphaelHulls = _.times(9, function(i) {
    var hull = paper.path()
        .attr('fill', hull_unselected_color)
        .attr('stroke-width', 24)
        .attr('stroke-linejoin','round')
        .attr('stroke', hull_unselected_color)
        .attr('stroke-linecap', 'round')
        .mousedown(function(i) {
            return function() {
                return onClusterClicked({
                    hullId: i
                });
            };}(i))
        .toBack();

        return hull;
});

function updateHulls() {
    bidToBucket = _.object(_.pluck(nodes, "bid"), nodes);
    hulls = clusters.map(function(cluster) {
        var top = Infinity;
        var bottom = -Infinity;
        var right = -Infinity;
        var left = Infinity;
        var temp = _.map(cluster, function(bid) {
            if (!bidToBucket[bid]) {
                return null;
            }
            var x = bidToBucket[bid].x;
            var y = bidToBucket[bid].y;
            return [x, y];
        });
        temp = _.filter(temp, function(xy) {
            // filter out nulls
            return !!xy;
        });

        return temp;
    });

    function makeHullShape(stuff) {
        return "M" + stuff.join("L") + "Z";
    }

    // hulls don't render when there's only one point
    // so make a nearby neighbor
    function makeDummyNeighbor(point) {
        return [
            point
        ];
    }
    // update hulls
    for (var i = 0; i < hulls.length; i++) {
        var d3Hull = d3Hulls[i];
        var hull = hulls[i];
        if (hull.length == 1) {
            hull.push([
                hull[0][0] + 0.01,
                hull[0][1] + 0.01
                ]);
        }
        if (hull.length == 2) {
            hull.push([
                hull[0][0] + 0.01,
                hull[0][1] - 0.01 // NOTE subtracting so they're not inline
                ]);
        }
        var points = d3.geom.hull(hull);
        if (points.length) {
            points.hullId = i; // NOTE: d is an Array, but we're tacking on the hullId. TODO Does D3 have a better way of referring to the hulls by ID?
            d3Hull.datum(points).attr("d", makeHullShape(points));

            points.unshift();
            var _transformed = Raphael.transformPath(makeHullShape(points), 'T0,0');
            raphaelHulls[i].animate({path: _transformed}, 0);
        }
    }
    updateHullColors();
}

var hullFps = 20;
var updateHullsThrottled = _.throttle(updateHulls, 1000/hullFps);
force.on("tick", function(e) {
      // Push nodes toward their designated focus.
      var k = 0.1 * e.alpha;
      //if (k <= 0.004) { return; } // save some CPU (and save battery) may stop abruptly if this thresh is too high
      nodes.forEach(function(o) {
          //o.x = o.targetX;
          //o.y = o.targetY;
          if (!o.x) { o.x = w/2; }
          if (!o.y) { o.y = h/2; }  
          o.x += (o.targetX - o.x) * k;
          o.y += (o.targetY - o.y) * k;
      });

      main_layer.selectAll(groupTag)
        .attr("transform", chooseTransformForRoots);




      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var bucket = rNodes[i];
        var x = node.x;
        var y = node.y;

        // console.log(x, y);
        // bucket.set.transform("T" + x + ","  + y);
        bucket.transform(x, y);
        // bucket.setUps(node.ups);
      }


    updateHullsThrottled();
    updateHelpArrow();
});

// function chooseRadius(d) {
//   var r = baseNodeRadius;
//     if (isSelf(d)){
//         return r += 2;
//     }
//     if (d.data && d.data.participants) {
//         return r + d.data.participants.length * 5;
//     }
//     return r;
// }

function shouldDisplayCircle(d) {
    // Hide the circle so we can show the up/down arrows
    if (selectedTid >= 0 &&
        !isSelf(d) // for now, always show circle - TODO fix up/down arrow for blue dot
        ) {
        return false;
    }
    return true;
}

function chooseDisplayForCircle(d) {
    return shouldDisplayCircle(d) ? "inherit" : "none";
}

function shouldDisplayArrows(d) {
    // Hide the circle so we can show the up/down arrows
    if (selectedTid >= 0) {
        return true;
    }
    return false;
}

function chooseDisplayForArrows(d) {
    return shouldDisplayArrows(d) ? "inherit" : "none";
}

function chooseFill(d) {
    // if (selectedTid >= 0) {
    //     if (d.effects === -1) {  // pull
    //         return colorPull;
    //     } else if (d.effects === 1) { // push
    //         return colorPush;
    //     }
    // }

    if (isSelf(d)) {
        return colorSelf;
    } else {
        return colorNoVote;
    }
}
function chooseStroke(d) {
    if (commentIsSelected()) {

    } else {
        if (isSelf(d)) {
            return colorSelfOutline;
        }
    }
}

function commentIsSelected() {
    return selectedTid >= 0;
}

function chooseAlpha(d) {
    if (commentIsSelected()) {
        // if (d.effects === undefined) {
        //     // no-vote
        //     // This should help differentiate a pass from a no-vote.
        //     return 0.5;
        // }
        // pass still gets full alpha
    } else {
        if (!isSelf(d)) {
            var voteCount = getTotalVotesByPidSync(d.pid);
            maxVoteCount = Math.max(voteCount, maxVoteCount);
            var ratio = (voteCount + 1) / (maxVoteCount + 1);
            scale = Math.max(0.3, ratio);
            return ratio;
        }
    }
    // isSelf or has voted on selected tid
    return 1;
}


function chooseTransformForRoots(d) {
   return "translate(" + d.x + "," + d.y + ")";
}

var offsetFactor = 4.9;
// function chooseTransformUpArrow(d) {
//     var scale = Math.sqrt(d.ups) * baseNodeRadius;
//     var yOffset = -offsetFactor * scale;
//     return "translate(0," + yOffset + ") scale(" + scale + ")";
// }

function makeArrowPoints(scale, shouldFlipY) {
    var left = -baseNodeRadius * scale;
    var right = baseNodeRadius * scale;
    // equilateral triangle
    var top = Math.sqrt(3 * right * right);
    var bottom = 0;
    if (shouldFlipY) {
        top *= -1;
    }
    var leftBottom = left + "," + bottom;
    var rightBottom = right + "," + bottom;
    var center = "0," + top;
    return leftBottom + " " + rightBottom + " " + center;
}

function chooseUpArrowPath(d) {
    var scale = Math.sqrt(d.ups || 0);
    return makeArrowPoints(scale, true);
}


// function chooseTransformDownArrow(d) {
//     var scale = Math.sqrt(d.downs) * baseNodeRadius;
//     var yOffset = offsetFactor * scale;
//     return "translate(0," + yOffset + ") scale(" + scale + ")";
// }
function chooseDownArrowPath(d) {
    var scale = Math.sqrt(d.downs || 0);
    return makeArrowPoints(scale, false);
}


function makeArrowPoints2(scale, shouldFlipY, originX, originY) {
    var left = -baseNodeRadius * scale;
    var right = baseNodeRadius * scale;
    // equilateral triangle
    var top = Math.sqrt(3 * right * right);
    if (shouldFlipY) {
        top *= -1;
    }
    top += originY;
    var bottom = originY;
    right += originX;
    left += originX;

    var f = function(x) {
        return Math.floor(x*10)/10;
    };

    var leftBottom = f(left) + " " + f(bottom);
    var rightBottom = f(right) + " " + f(bottom);
    var center = f(originX) + " " + f(top);
    var s =  "M " + leftBottom + " L " + rightBottom + " L " + center + " L " + leftBottom + " Z";
    return s;
}

function chooseUpArrowPath2(ups, originX, originY) {
    var scale = Math.sqrt(ups || 0);
    return makeArrowPoints2(scale, true, originX, originY);
}

function chooseDownArrowPath2(downs, originX, originY) {
    var scale = Math.sqrt(downs || 0);
    return makeArrowPoints2(scale, false, originX, originY);
}






function chooseCircleRadius(d) {
    return Math.sqrt(d.count) * baseNodeRadius * 0.8;
}
function chooseCircleRadiusOuter(d) {
    var r = chooseCircleRadius(d);
    if (isSelf(d)) {
        r *= 2;
    }
    return r;
}




function isSelf(d) {
    return !!d.containsSelf;
}

function hashCode(s){
    var hash = 0,
        i,
        character;
    if (s.length === 0) {
        return hash;
    }
    for (i = 0; i < s.length; i++) {
        character = s.charCodeAt(i);
        hash = ((hash<<5)-hash)+character;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}

// var colorFromString = _.compose(d3.scale.category20(), function(s) {
//     return hashCode(s) % 20;
// });

function key(d) {
    return d.bid;
}

// clusters [[2,3,4],[1,5]]
function upsertNode(updatedNodes, newClusters) {
    console.log("upsert");
    //nodes.set(node.pid, node);


    // migrate an existing cluster selection to the new similar cluster
    // var readyToReselectComment = $.Deferred().resolve();
    // if (selectedCluster !== false) {

    //     var currentSelectedCluster = clusters[selectedCluster];

    //     var nearestCluster = argMax(
    //         _.partial(clusterSimilarity, currentSelectedCluster),
    //         newClusters);

    //     var nearestClusterId = newClusters.indexOf(nearestCluster);
    //     clusters = newClusters;
    //     readyToReselectComment = setClusterActive(nearestClusterId);
    // } else {
        clusters = newClusters;
    // }

    for (var c = 0; c < clusters.length; c++) {
        var cluster = clusters[c];
        for (var b = 0; b < cluster.length; b++) {
            bidToGid[cluster[b]] = c;
        }
    }
    
    // readyToReselectComment.done(function() {
    //     if (selectedTid >= 0) {
    //         selectComment(selectedTid);
    //     }
    // });


    function computeTarget(d) {
        //if (!isPersonNode(d)) {
            // If we decide to show the branching points, we could
            // compute their position as the average of their childrens
            // positions, and return that here.
            //return;
        //}

        d.x = d.targetX = scaleX(d.proj.x);
        d.y = d.targetY = scaleY(d.proj.y);
        return d;
    }


    var maxNodeRadius = 10 + 5;

  function createScales(updatedNodes) {
    var spans = computeXySpans(updatedNodes);
    var border = maxNodeRadius + w / 50;
    return {
        x: d3.scale.linear().range([0 + border, w - border]).domain([spans.x.min - eps, spans.x.max + eps]),
        y: d3.scale.linear().range([0 + border, h - border]).domain([spans.y.min - eps, spans.y.max + eps])
    };
  }
    // TODO pass all nodes, not just updated nodes, to createScales.
    var scales = createScales(updatedNodes);
    var scaleX = scales.x;
    var scaleY = scales.y;

    var oldpositions = nodes.map( function(node) { return { x: node.x, y: node.y, bid: node.bid }; });

    function sortWithSelfOnTop(a, b) {
        if (isSelf(a)) {
            return 1;
        }
        if (isSelf(b)) {
            return -1;
        }
        return key(b) - key(a);
    }

    var bidToOldNode = _.indexBy(nodes, getBid);

    for (var i = 0; i < updatedNodes.length; i++) {
        var node = updatedNodes[i];
        var oldNode = bidToOldNode[node.bid];
        if (oldNode) {
            node.effects = oldNode.effects;
        }
    }

    nodes = updatedNodes.sort(sortWithSelfOnTop).map(computeTarget);
    console.log("number of people: " + nodes.length);

    oldpositions.forEach(function(oldNode) {
        var newNode = _.findWhere(nodes, {bid: oldNode.bid});
        if (!newNode) {
            console.error("not sure why a node would dissapear");
            return;
        }
        newNode.x = oldNode.x;
        newNode.y = oldNode.y;
    });

    force.nodes(nodes, key).start();

    // simplify debugging by looking at a single node
    //nodes = nodes.slice(0, 1);
    // check for unexpected changes in input
    if (window.temp !== undefined) {
        if (key(window.temp) !== key(nodes[0])) {
            console.log("changed key");
            console.dir(window.temp);
            console.dir(nodes[0]);
        }
        if (!_.isEqual(window.temp.proj, nodes[0].proj)) {
            console.log("changed projection");
            console.dir(window.temp);
            console.dir(nodes[0]);
        }
        window.temp = nodes[0];
    }

// TODO use key to guarantee unique items

  var update = main_layer.selectAll(groupTag)
      .data(nodes, key)
      .sort(sortWithSelfOnTop);

  // var exit = update.exit();
  // exit.remove();

  // ENTER
  var enter = update.enter();
  var g = enter
    .append(groupTag)
      .classed("ptpt", true)
      .classed("node", true)
      .on("click", onParticipantClicked)
      .on("mouseover", showTip)
      .on("mouseout", hideTip)
      .call(force.drag)
  ;

  // OUTER TRANSLUCENT SHAPES
  var opacityOuter = 0.2;
  var upArrowEnter = g.append("polygon") 
    .classed("up", true)
    .classed("bktv", true)
    .style("fill", colorPull)
    .style("fill-opacity", opacityOuter)
    // .style("stroke", colorPullOutline)
    // .style("stroke-width", 1)
    ;
  var downArrowEnter = g.append("polygon")
    .classed("down", true)
    .classed("bktv", true)
    .style("fill", colorPush)
    .style("fill-opacity", opacityOuter)
    // .style("stroke", colorPushOutline)
    // .style("stroke-width", 1)
    ;
  var circleEnter = g.append("circle")
    .classed("circle", true)
    .classed("bktv", true)
    .attr("cx", 0)
    .attr("cy", 0)
    .style("opacity", opacityOuter)
    .style("fill", chooseFill)
    .filter(isSelf)
        .style("fill", "rgba(0,0,0,0)")
        .style("stroke", colorSelf)
        .style("stroke-width", 1)
        .style("opacity", 0.5)
    ;

  // INNER SCALE-CHANGING SHAPES
  var upArrowEnterInner = g.append("polygon")
    .classed("up", true)
    .classed("bktvi", true)
    .style("fill", colorPull)
    ;

  var downArrowEnterInner = g.append("polygon")
    .classed("down", true)
    .classed("bktvi", true)
    .style("fill", colorPush)
    ;

  var circleEnterInner = g.append("circle")
    .classed("circle", true)
    .classed("bktvi", true)
    .style("fill", chooseFill)
    ;

  var self = g.filter(isSelf);
  self.classed("selfDot", true);

  updateNodes();

  // update
  //     .attr("transform", chooseTransform)
  //     .selectAll("path")
  //         .attr("d", chooseShape)
  //         .style("stroke-width", strokeWidth)
  //         .style("stroke", chooseStroke)
  //         .style("fill", chooseFill)
  //     ;




  // visualization.selectAll(".ptpt")
  //       .transition()
  //       .duration(500)
  //       .style("fill", chooseFill)
  //       .transition()
  //         .duration(500);

  updateHulls();
  updateHelpArrow();

  if (selectedTid >= 0) {
    selectComment(selectedTid);
  }

}

function selectComment(tid) {
    selectedTid = tid;

    getReactionsToComment(tid)
      // .done(unhoverAll)
      .then(function(votes) {
        for (i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            node.ups = votes.A[node.bid] || 0;
            node.downs = votes.D[node.bid] || 0;

            // for (var p = 0; p < node.ppl.length; p++) {

            //     // TODO_MAXDOTS count up the votes of each type for each user (instead of just ppl[0])
            //     var reaction = bidToVote[node.ppl[p].pid];
            //     if (reaction) {
            //         if (reaction.vote === -1) {
            //             node.ups += 1;
            //         } else if (reaction.vote === 1) {
            //             node.downs += 1;
            //         }
            //     }
            // }
        }
        updateNodes();
        // visualization.selectAll(groupTag)
        //   .attr("transform", chooseTransform)
        //   .selectAll("path")
        //       .style("fill", chooseFill)
        //       .style("stroke", chooseStroke)
        //       .style("fill-opacity", chooseAlpha)
        //       // .attr("r", chooseRadius)
        //       .attr("d", chooseShape)
         // ;
    }, function() {
        console.error("failed to get reactions to comment: " + d.tid);
    });

    if (d3CommentList) {
        d3CommentList
            .style("background-color", chooseCommentFill)
            .style("color", chooseCommentTextColor);
    }

}

// TODO move this stuff out into a backbone view.
function chooseCommentFill(d) {
    if (selectedTid === d.tid) {
        return "#428bca";
    } else {
        // return nothing since we want the hover class to be able to set
        return;
    }
}

function chooseCommentTextColor(d) {
    if (selectedTid === d.tid) {
        return "white";
    } else {
        return "black";
    }
}

function renderComments(comments) {
    function renderWithCarousel() {
        $(el_carouselSelector).html("");
        // $(el_carouselSelector).css("overflow", "hidden");        

        // $(el_carouselSelector).append("<div id='smallWindow' style='width:90%'></div>");
        $(el_carouselSelector).append("<div id='smallWindow' style='left: 5%; width:90%'></div>");        

        var results = $("#smallWindow");
        results.addClass("owl-carousel");
        // results.css('background-color', 'yellow');

        if (results.data('owlCarousel')) {
            results.data('owlCarousel').destroy();
        }
        results.owlCarousel({
          items : 3, //3 items above 1000px browser width
          // itemsDesktop : [1000,5], //5 items between 1000px and 901px
          // itemsDesktopSmall : [900,3], // betweem 900px and 601px
          // itemsTablet: [600,2], //2 items between 600 and 0
          // itemsMobile : false // itemsMobile disabled - inherit from itemsTablet option
           singleItem : true,
           // autoHeight : true,
           afterMove: (function() {return function() {
                var tid = indexToTid[this.currentItem];
                setTimeout(function() {
                    selectComment(tid);
                }, 100);

            }}())
        });
        var indexToTid = _.map(comments, function(c) {
            return c.tid;
        });
        _.each(comments, function(c) {
            results.data('owlCarousel').addItem("<div style='margin:10px; text-align:justify' class='well query_result_item'>" + c.txt + "</div>");
        });
        // Auto-select the first comment.
        if (comments.length) {
            selectComment(comments[0].tid);
        }
    }
    function renderWithList() {
        queryResults.html("");    
        d3CommentList = queryResults.selectAll("li")
            .data(comments)
            .sort(function(a,b) { return b.freq - a.freq; });

        d3CommentList.enter()
            .append("li")
            .classed("query_result_item", true)
            .style("background-color", chooseCommentFill)
            .style("color", chooseCommentTextColor)
            .on("click", function(d) {
                selectComment(d.tid);
            })
            .on("mouseover", function() {
                d3.select(this).classed("hover", true);
            })
            .on("mouseout", function() {
                d3.select(this).classed("hover", false);
            })
            .text(function(d) { return d.txt; });

        d3CommentList.exit().remove();
    }
    var dfd = $.Deferred();

    if (comments.length) {
        $(el_queryResultSelector).show();
    } else {
        $(el_queryResultSelector).hide();
    }
    if (useCarousel()) {
        renderWithCarousel();
    } else {
        renderWithList();
    }
    setTimeout(dfd.resolve, 4000);
    eb.trigger("queryResultsRendered");
    return dfd.promise();
}


function onParticipantClicked(d) {
    // alert(1);
    // d3.event.stopPropagation();
    // d3.event.preventDefault(); // prevent flashing on iOS
  // alert(getUserInfoByPid(d.pid).hname)
  var gid = bidToGid[d.bid];
  if (_.isNumber(gid)) {
      handleOnClusterClicked(gid);
  }
}

function unhoverAll() {
  console.log("unhoverAll");
  if (d3CommentList) {
    d3CommentList
      .style("background-color", chooseCommentFill)
      .style("color", chooseCommentTextColor);

  }
  // for (var i = 0; i < nodes.length; i++) {
  //     var node = nodes[i];
  //     node.ups = 0
  // }
  updateNodes();
}

function updateNodes() {
  var update = visualization.selectAll(groupTag);

              var commonUpdate = update.selectAll(".node > .bktv")
                  ;
              var commonUpdateInner = update.selectAll(".node > .bktvi")
                  // .style("stroke-width", strokeWidth)
                  // .style("stroke", chooseStroke)
                  // .style("transform", "scale(0.5)")
                  ;

  var upArrowUpdate = update.selectAll(".up.bktv").data(nodes, key)
      .style("display", chooseDisplayForArrows)
      .attr("points", chooseUpArrowPath)
      // .style("fill", colorPull)
      ;
  var upArrowUpdateInner = update.selectAll(".up.bktvi").data(nodes, key)
      .style("display", chooseDisplayForArrows)
      .attr("points", chooseUpArrowPath) // NOTE: using tranform to select the scale
      ;

  var downArrowUpdate = update.selectAll(".down.bktv").data(nodes, key)
      .style("display", chooseDisplayForArrows)
      .attr("points", chooseDownArrowPath)
      // .style("fill", colorPush)
      ;
  var downArrowUpdateInner = update.selectAll(".down.bktvi").data(nodes, key)
      .style("display", chooseDisplayForArrows)
      .attr("points", chooseDownArrowPath) // NOTE: using tranform to select the scale
      ;

  var upCircleUpdate = update.selectAll(".circle.bktv").data(nodes, key)
      .style("display", chooseDisplayForCircle)
      .attr("r", chooseCircleRadiusOuter)
      // .style("fill", chooseFill)
      ;
  var upCircleUpdateInner = update.selectAll(".circle.bktvi").data(nodes, key)
      .style("display", chooseDisplayForCircle)
      .attr("r", chooseCircleRadius) // NOTE: using tranform to select the scale
      ;
  
  var selfNode = _.filter(nodes, isSelf)[0];
  if (selfNode && !selfHasAppeared) {
    selfHasAppeared = true;
    onSelfAppearsCallbacks.fire();

    setupBlueDotHelpText(update.select(".selfDot"));
  }

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var bucket = rNodes[i];
    var r = chooseCircleRadius(node);
    bucket.radius = r;
    bucket.circleOuter.attr("r", r);
    bucket.scaleCircle(1); // sets the inner circle radius
    bucket.setUps(node.ups);
    bucket.setDowns(node.downs);
    if (shouldDisplayCircle(node)) {
        bucket.circle.show();
        bucket.circleOuter.show();
    } else {
        bucket.circle.hide();
        bucket.circleOuter.hide();
    }
    if (shouldDisplayArrows(node)) {
        bucket.up.show();
        bucket.down.show();        
    } else {
        bucket.up.hide();
        bucket.down.hide();
    }
    if (isSelf(node)) {
        bucket.circle.attr("fill", colorSelf);

        bucket.circleOuter.attr("fill", "rgba(255,255,255,0)");
        bucket.circleOuter.attr("stroke", colorSelf);
        bucket.circleOuter.attr("stroke-width", 1);
        bucket.circleOuter.attr("opacity", 0.5);
        bucket.circleOuter.attr("r", bucket.radius * 2);


    } else {
        bucket.circle.attr("fill", colorNoVote);
        bucket.circleOuter.attr("fill", colorNoVote);
        bucket.circleOuter.attr("stroke", colorSelf);
        bucket.circleOuter.attr("stroke-width", 0);
        bucket.circleOuter.attr("opacity", "");
        bucket.circleOuter.attr("r", bucket.radius);        
    }
  }
  // displayHelpItem("foo");

  // visualization.selectAll(groupTag)
  //   .attr("transform", chooseTransform)
  //   .selectAll("path")
  //       .style("stroke", chooseStroke)
  //       .style("fill", chooseFill)
  //       .style("fill-opacity", chooseAlpha)
  //       // .attr("r", chooseRadius)
  //       .attr("d", chooseShape)
  //   ;

}

function resetSelectedComment() {
  selectedTid = -1;
}

function resetSelection() {
  console.log("resetSelection");
  visualization.selectAll(".active").classed("active", false);
  selectedCluster = false;
  // visualization.transition().duration(750).attr("transform", "");
  renderComments([]);
  selectedBids = [];
  resetSelectedComment();
  unhoverAll();
}


function selectBackground() {
  resetSelection();
  // selectedBids = [];
  // resetSelectedComment();
  // unhoverAll();

  setClusterActive(false)
    .then(
        updateHulls,
        updateHulls);

  updateHullColors();
}


// TODO account for Buckets
function emphasizeParticipants(pids) {
    console.log("pids", pids.length);
    var hash = []; // sparse-ish array
    getPidToBidMapping().then(function(pidToBid, bidToPids) {

        for (var i = 0; i < pids.length; i++) {
            var bid = pidToBid[pids[i]];
            hash[bid] |= 0; // init
            hash[bid] += 1; // count the person
        }

        function chooseStrokeWidth(d) {
            // If emphasized, maintain fill, (no stroke needed)
            if (hash[d.bid]) {
                return 0;
            }
            return 2;
        }
        function chooseStroke(d) {
            // If emphasized, maintain fill, (no stroke needed)
            if (hash[d.bid]) {
                return void 0; // undefined
            }
            return chooseFill(d);
        }
        function chooseFillOpacity(d) {
            // If emphasized, maintain fill, (no stroke needed)
            if (hash[d.bid] >= 2) {
                return 1;
            }
            return 0.2;
        }

        function chooseTransformSubset(d) {
            var bid = d.bid;
            var ppl = bidToPids[bid];
            var total = ppl ? ppl.length : 0;
            var active = hash[bid] || 0;
            var ratio = active/total;
            if (ratio > 0.99) {
                return;
            } else {
                return "scale(" + ratio + ")";
            }
        }
        function chooseTransformSubsetRaphael(d) {
            var bid = d.bid;
            var ppl = bidToPids[bid];
            var total = ppl ? ppl.length : 0;
            var active = hash[bid] || 0;
            var ratio = active/total;
            if (ratio > 0.99 || total === 0) {
                return 1;
            } else {
                return ratio;
            }
        }

        visualization.selectAll(".bktvi")
            // .attr("stroke", chooseStroke)
            .attr("transform", chooseTransformSubset)
            // .attr("stroke-width", chooseStrokeWidth)
            // .attr("fill-opacity", chooseFillOpacity)
        ;

        for (var j = 0; j < nodes.length; j++) {
            var node = nodes[j];
            var bucket = rNodes[j];
            var s = chooseTransformSubsetRaphael(node);
            bucket.scaleCircle(s);
            // bucket.circle.scale(s, s)
        }
    });
}


function updateHelpArrow() {
    var selfNode = _.filter(nodes, isSelf)[0];
    if (!selfNode) {
        return;
    }
    var x = selfNode.x;
    var y = selfNode.y;
    var baseShouldIntersectEdge = true;
    var helpArrowStrokeWidth = 3;
    var extraY = -helpArrowStrokeWidth; // extend past the edge so it's flush (so you don't see the square base of the arrow)
    var baseX = w/3;
    var baseY = h - (baseShouldIntersectEdge ? extraY : 0);
    var tipX = x;
    var tipY = y;
    var dx = tipX - baseX;
    var dy = tipY - baseY;
    var ratio = 0.9;
    tipX = baseX + dx*ratio;
    tipY = baseY + dy*ratio;
    overlay_layer.selectAll(".helpArrow")
        .attr("points", baseX + "," + baseY + " " + tipX + "," + tipY)
    ;
}

// MAke the help item's arrow a child of the elementToPointAt, and update its points to be from 0,0 to 

// function displayHelpItem(content) {
//     overlay_layer.selectAll(".helpArrow")
//         .style("display", "block")
//         .attr("marker-end", "url(#ArrowTip)");
//     updateHelpArrow();

//     // $(".helpArrow").removeClass("hidden");
//     $("#helpTextBox").removeClass("hidden");
//     $("#helpTextMessage").html(content);
// }

function onHelpTextClicked() {
    overlay_layer.selectAll(".helpArrow")
        .style("display", "none");
    // $(".helpArrow").addClass("hidden");
    $("#helpTextBox").addClass("hidden");
}

// window.foo = displayHelpItem;
// displayHelpItem("foo");


function setupBlueDotHelpText(self) {
    if (SELF_DOT_SHOW_INITIALLY) {
        selfDotTooltipShow = false; // no tooltip

        var txt = self.append("text")
            .text(selfDotHintText)
            .attr("text-anchor", "middle")
            .attr("transform", "translate(0, -10)");
        if (SELF_DOT_HINT_HIDE_AFTER_DELAY) {
          txt.transition(200)
            .delay(SELF_DOT_HINT_HIDE_AFTER_DELAY)
            .style("opacity", 0)
            .each("end", function() {
              selfDotTooltipShow = true;
              // need to remove the tooltip so it doesn't eat hover events
              d3.select(this).remove();
            });
        }
    }
}


eb.on(eb.vote, function() {
  var update = visualization.selectAll(".node").filter(isSelf);
  update
    .attr("opacity", 0)
    .transition(10)
      .delay(10)
      .attr("opacity", 1);

});

// setTimeout(selectBackground, 1);

return {
    upsertNode: upsertNode,
    onSelfAppears: onSelfAppearsCallbacks.add,
    deselect: selectBackground,
    // dipsplayBlueDotHelpItem: displayHelpItem,
    emphasizeParticipants: emphasizeParticipants,
};

};
