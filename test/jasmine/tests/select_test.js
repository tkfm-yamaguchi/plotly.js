var d3 = require('d3');

var Plotly = require('@lib/index');
var Lib = require('@src/lib');
var click = require('../assets/click');
var doubleClick = require('../assets/double_click');
var DBLCLICKDELAY = require('../../../src/constants/interactions').DBLCLICKDELAY;

var createGraphDiv = require('../assets/create_graph_div');
var destroyGraphDiv = require('../assets/destroy_graph_div');
var failTest = require('../assets/fail_test');
var mouseEvent = require('../assets/mouse_event');
var touchEvent = require('../assets/touch_event');

var LONG_TIMEOUT_INTERVAL = 5 * jasmine.DEFAULT_TIMEOUT_INTERVAL;
var delay = require('../assets/delay');
var sankeyConstants = require('@src/traces/sankey/constants');

function drag(path, options) {
    var len = path.length;

    if(!options) options = {type: 'mouse'};

    Lib.clearThrottle();

    if(options.type === 'touch') {
        touchEvent('touchstart', path[0][0], path[0][1], options);

        path.slice(1, len).forEach(function(pt) {
            Lib.clearThrottle();
            touchEvent('touchmove', pt[0], pt[1], options);
        });

        touchEvent('touchend', path[len - 1][0], path[len - 1][1], options);
        return;
    }

    mouseEvent('mousemove', path[0][0], path[0][1], options);
    mouseEvent('mousedown', path[0][0], path[0][1], options);

    path.slice(1, len).forEach(function(pt) {
        Lib.clearThrottle();
        mouseEvent('mousemove', pt[0], pt[1], options);
    });

    mouseEvent('mouseup', path[len - 1][0], path[len - 1][1], options);
}

function assertSelectionNodes(cornerCnt, outlineCnt, _msg) {
    var msg = _msg ? ' - ' + _msg : '';

    expect(d3.selectAll('.zoomlayer > .zoombox-corners').size())
        .toBe(cornerCnt, 'selection corner count' + msg);
    expect(d3.selectAll('.zoomlayer > .select-outline').size())
        .toBe(outlineCnt, 'selection outline count' + msg);
}

var selectingCnt, selectingData, selectedCnt, selectedData, deselectCnt, doubleClickData;
var selectedPromise, deselectPromise, clickedPromise;

function resetEvents(gd) {
    selectingCnt = 0;
    selectedCnt = 0;
    deselectCnt = 0;
    doubleClickData = null;

    gd.removeAllListeners();

    selectedPromise = new Promise(function(resolve) {
        gd.on('plotly_selecting', function(data) {
            // note that since all of these events test node counts,
            // and all of the other tests at some point check that each of
            // these event handlers was called (via assertEventCounts),
            // we no longer need separate tests that these nodes are created
            // and this way *all* subplot variants get the test.
            assertSelectionNodes(1, 2);
            selectingCnt++;
            selectingData = data;
        });

        gd.on('plotly_selected', function(data) {
            // With click-to-select supported, selection nodes are only
            // in the DOM in certain circumstances.
            if(data &&
              gd._fullLayout.dragmode.indexOf('select') > -1 &&
              gd._fullLayout.dragmode.indexOf('lasso') > -1) {
                assertSelectionNodes(0, 2);
            }
            selectedCnt++;
            selectedData = data;
            resolve();
        });
    });

    deselectPromise = new Promise(function(resolve) {
        gd.on('plotly_deselect', function(data) {
            assertSelectionNodes(0, 0);
            deselectCnt++;
            doubleClickData = data;
            resolve();
        });
    });

    clickedPromise = new Promise(function(resolve) {
        gd.on('plotly_click', function() {
            resolve();
        });
    });
}

function assertEventCounts(selecting, selected, deselect, msg) {
    expect(selectingCnt).toBe(selecting, 'plotly_selecting call count: ' + msg);
    expect(selectedCnt).toBe(selected, 'plotly_selected call count: ' + msg);
    expect(deselectCnt).toBe(deselect, 'plotly_deselect call count: ' + msg);
}

// TODO: in v2, when we get rid of the `plotly_selected->undefined` event, these will
// change to BOXEVENTS = [1, 1, 1], LASSOEVENTS = [4, 1, 1]. See also _run down below
//
// events for box or lasso select mouse moves then a doubleclick
var NOEVENTS = [0, 0, 0];
// deselect used to give an extra plotly_selected event on the first click
// with undefined event data - but now that's gone, since `clickFn` handles this.
var BOXEVENTS = [1, 2, 1];
// assumes 5 points in the lasso path
var LASSOEVENTS = [4, 2, 1];

var SELECT_PATH = [[93, 193], [143, 193]];
var LASSO_PATH = [[316, 171], [318, 239], [335, 243], [328, 169]];

describe('Click-to-select', function() {
    var mock14Pts = {
        '1': { x: 134, y: 116 },
        '7': { x: 270, y: 160 },
        '10': { x: 324, y: 198 },
        '35': { x: 685, y: 341 }
    };
    var gd;

    beforeEach(function() {
        gd = createGraphDiv();
    });

    afterEach(destroyGraphDiv);

    function plotMock14(layoutOpts) {
        var mock = require('@mocks/14.json');
        var defaultLayoutOpts = {
            layout: {
                clickmode: 'event+select',
                dragmode: 'select',
                hovermode: 'closest'
            }
        };
        var mockCopy = Lib.extendDeep(
          {},
          mock,
          defaultLayoutOpts,
          { layout: layoutOpts });

        return Plotly.plot(gd, mockCopy.data, mockCopy.layout);
    }

    /**
     * Executes a click and before resets selection event handlers.
     * By default, click is executed with a delay to prevent unwanted double clicks.
     * Returns the `selectedPromise` promise for convenience.
     */
    function _click(x, y, clickOpts, immediate) {
        resetEvents(gd);

        // Too fast subsequent calls of `click` would
        // produce an unwanted double click, thus we need
        // to delay the click.
        if(immediate) {
            click(x, y, clickOpts);
        } else {
            setTimeout(function() {
                click(x, y, clickOpts);
            }, DBLCLICKDELAY * 1.03);
        }

        return selectedPromise;
    }

    function _clickPt(coords, clickOpts, immediate) {
        expect(coords).toBeDefined('coords needs to be defined');
        expect(coords.x).toBeDefined('coords.x needs to be defined');
        expect(coords.y).toBeDefined('coords.y needs to be defined');

        return _click(coords.x, coords.y, clickOpts, immediate);
    }

    /**
     * Convenient helper to execute a click immediately.
     */
    function _immediateClickPt(coords, clickOpts) {
        return _clickPt(coords, clickOpts, true);
    }

    /**
     * Asserting selected points.
     *
     * @param expected can be a point number, an array
     * of point numbers (for a single trace) or an array of point number
     * arrays in case of multiple traces. undefined in an array of arrays
     * is also allowed, e.g. useful when not all traces support selection.
     */
    function assertSelectedPoints(expected) {
        var expectedPtsPerTrace = toArrayOfArrays(expected);
        var expectedPts, traceNum;

        for(traceNum = 0; traceNum < expectedPtsPerTrace.length; traceNum++) {
            expectedPts = expectedPtsPerTrace[traceNum];
            expect(gd._fullData[traceNum].selectedpoints).toEqual(expectedPts);
            expect(gd.data[traceNum].selectedpoints).toEqual(expectedPts);
        }

        function toArrayOfArrays(expected) {
            var isArrayInArray, i;

            if(Array.isArray(expected)) {
                isArrayInArray = false;
                for(i = 0; i < expected.length; i++) {
                    if(Array.isArray(expected[i])) {
                        isArrayInArray = true;
                        break;
                    }
                }

                return isArrayInArray ? expected : [expected];
            } else {
                return [[expected]];
            }
        }
    }

    function assertSelectionCleared() {
        gd._fullData.forEach(function(fullDataItem) {
            expect(fullDataItem.selectedpoints).toBeUndefined();
        });
    }

    it('selects a single data point when being clicked', function(done) {
        plotMock14()
          .then(function() { return _immediateClickPt(mock14Pts[7]); })
          .then(function() { assertSelectedPoints(7); })
          .catch(failTest)
          .then(done);
    });

    describe('clears entire selection when the last selected data point', function() {
        [{
            desc: 'is clicked',
            clickOpts: {}
        }, {
            desc: 'is clicked while add/subtract modifier keys are active',
            clickOpts: { shiftKey: true }
        }].forEach(function(testData) {
            it('@flaky ' + testData.desc, function(done) {
                plotMock14()
                  .then(function() { return _immediateClickPt(mock14Pts[7]); })
                  .then(function() {
                      assertSelectedPoints(7);
                      _clickPt(mock14Pts[7], testData.clickOpts);
                      return deselectPromise;
                  })
                  .then(function() {
                      assertSelectionCleared();
                      return _clickPt(mock14Pts[35], testData.clickOpts);
                  })
                  .then(function() {
                      assertSelectedPoints(35);
                  })
                  .catch(failTest)
                  .then(done);
            });
        });
    });

    it('@flaky cleanly clears and starts selections although add/subtract mode on', function(done) {
        plotMock14()
          .then(function() {
              return _immediateClickPt(mock14Pts[7]);
          })
          .then(function() {
              assertSelectedPoints(7);
              _clickPt(mock14Pts[7], { shiftKey: true });
              return deselectPromise;
          })
          .then(function() {
              assertSelectionCleared();
              return _clickPt(mock14Pts[35], { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints(35);
          })
          .catch(failTest)
          .then(done);
    });

    it('@flaky supports adding to an existing selection', function(done) {
        plotMock14()
          .then(function() { return _immediateClickPt(mock14Pts[7]); })
          .then(function() {
              assertSelectedPoints(7);
              return _clickPt(mock14Pts[35], { shiftKey: true });
          })
          .then(function() { assertSelectedPoints([7, 35]); })
          .catch(failTest)
          .then(done);
    });

    it('@flaky supports subtracting from an existing selection', function(done) {
        plotMock14()
          .then(function() { return _immediateClickPt(mock14Pts[7]); })
          .then(function() {
              assertSelectedPoints(7);
              return _clickPt(mock14Pts[35], { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints([7, 35]);
              return _clickPt(mock14Pts[7], { shiftKey: true });
          })
          .then(function() { assertSelectedPoints(35); })
          .catch(failTest)
          .then(done);
    });

    it('@flaky can be used interchangeably with lasso/box select', function(done) {
        plotMock14()
          .then(function() {
              return _immediateClickPt(mock14Pts[35]);
          })
          .then(function() {
              assertSelectedPoints(35);
              drag(SELECT_PATH, { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints([0, 1, 35]);
              return _immediateClickPt(mock14Pts[7], { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints([0, 1, 7, 35]);
              return _clickPt(mock14Pts[1], { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints([0, 7, 35]);
              return Plotly.relayout(gd, 'dragmode', 'lasso');
          })
          .then(function() {
              assertSelectedPoints([0, 7, 35]);
              drag(LASSO_PATH, { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints([0, 7, 10, 35]);
              return _clickPt(mock14Pts[10], { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints([0, 7, 35]);
              drag([[670, 330], [695, 330], [695, 350], [670, 350]],
                { shiftKey: true, altKey: true });
          })
          .then(function() {
              assertSelectedPoints([0, 7]);
              return _clickPt(mock14Pts[35], { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints([0, 7, 35]);
              return _clickPt(mock14Pts[7]);
          })
          .then(function() {
              assertSelectedPoints([7]);
              return doubleClick(650, 100);
          })
          .then(function() {
              assertSelectionCleared();
          })
          .catch(failTest)
          .then(done);
    });

    it('@gl works in a multi-trace plot', function(done) {
        Plotly.plot(gd, [
            {
                x: [1, 3, 5, 4, 10, 12, 12, 7],
                y: [2, 7, 6, 1, 0, 13, 6, 12],
                type: 'scatter',
                mode: 'markers',
                marker: { size: 20 }
            }, {
                x: [1, 7, 6, 2],
                y: [2, 3, 5, 4],
                type: 'bar'
            }, {
                x: [7, 8, 9, 10],
                y: [7, 9, 13, 21],
                type: 'scattergl',
                mode: 'markers',
                marker: { size: 20 }
            }
        ], {
            width: 400,
            height: 600,
            hovermode: 'closest',
            dragmode: 'select',
            clickmode: 'event+select'
        })
          .then(function() {
              return _click(136, 369, {}, true);
          })
          .then(function() {
              assertSelectedPoints([[1], [], []]);
              return _click(245, 136, { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints([[1], [], [3]]);
              return _click(183, 470, { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints([[1], [2], [3]]);
          })
          .catch(failTest)
          .then(done);
    });

    it('@flaky is supported in pan/zoom mode', function(done) {
        plotMock14({ dragmode: 'zoom' })
          .then(function() {
              return _immediateClickPt(mock14Pts[35]);
          })
          .then(function() {
              assertSelectedPoints(35);
              return _clickPt(mock14Pts[7], { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints([7, 35]);
              return _clickPt(mock14Pts[7], { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints(35);
              drag(LASSO_PATH);
          })
          .then(function() {
              assertSelectedPoints(35);
              _clickPt(mock14Pts[35], { shiftKey: true });
              return deselectPromise;
          })
          .then(function() {
              assertSelectionCleared();
          })
          .catch(failTest)
          .then(done);
    });

    it('@flaky retains selected points when switching between pan and zoom mode', function(done) {
        plotMock14({ dragmode: 'zoom' })
          .then(function() {
              return _immediateClickPt(mock14Pts[35]);
          })
          .then(function() {
              assertSelectedPoints(35);
              return Plotly.relayout(gd, 'dragmode', 'pan');
          })
          .then(function() {
              assertSelectedPoints(35);
              return _clickPt(mock14Pts[7], { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints([7, 35]);
              return Plotly.relayout(gd, 'dragmode', 'zoom');
          })
          .then(function() {
              assertSelectedPoints([7, 35]);
              return _clickPt(mock14Pts[7], { shiftKey: true });
          })
          .then(function() {
              assertSelectedPoints(35);
          })
          .catch(failTest)
          .then(done);
    });

    it('@gl is supported by scattergl in pan/zoom mode', function(done) {
        Plotly.plot(gd, [
            {
                x: [7, 8, 9, 10],
                y: [7, 9, 13, 21],
                type: 'scattergl',
                mode: 'markers',
                marker: { size: 20 }
            }
        ], {
            width: 400,
            height: 600,
            hovermode: 'closest',
            dragmode: 'zoom',
            clickmode: 'event+select'
        })
          .then(function() {
              return _click(230, 340, {}, true);
          })
          .then(function() {
              assertSelectedPoints(2);
          })
          .catch(failTest)
          .then(done);
    });

    it('@flaky deals correctly with histogram\'s binning in the persistent selection case', function(done) {
        var mock = require('@mocks/histogram_colorscale.json');
        var firstBinPts = [0];
        var secondBinPts = [1, 2];
        var thirdBinPts = [3, 4, 5];

        mock.layout.clickmode = 'event+select';
        Plotly.plot(gd, mock.data, mock.layout)
          .then(function() {
              return clickFirstBinImmediately();
          })
          .then(function() {
              assertSelectedPoints(firstBinPts);
              return shiftClickSecondBin();
          })
          .then(function() {
              assertSelectedPoints([].concat(firstBinPts, secondBinPts));
              return shiftClickThirdBin();
          })
          .then(function() {
              assertSelectedPoints([].concat(firstBinPts, secondBinPts, thirdBinPts));
              return clickFirstBin();
          })
          .then(function() {
              assertSelectedPoints([].concat(firstBinPts));
              clickFirstBin();
              return deselectPromise;
          })
          .then(function() {
              assertSelectionCleared();
          })
          .catch(failTest)
          .then(done);

        function clickFirstBinImmediately() { return _immediateClickPt({ x: 141, y: 358 }); }
        function clickFirstBin() { return _click(141, 358); }
        function shiftClickSecondBin() { return _click(239, 330, { shiftKey: true }); }
        function shiftClickThirdBin() { return _click(351, 347, { shiftKey: true }); }
    });

    it('@flaky ignores clicks on boxes in a box trace type', function(done) {
        var mock = Lib.extendDeep({}, require('@mocks/box_grouped_horz.json'));

        mock.layout.clickmode = 'event+select';
        mock.layout.width = 1100;
        mock.layout.height = 450;

        Plotly.plot(gd, mock.data, mock.layout)
          .then(function() {
              return clickPtImmediately();
          })
          .then(function() {
              assertSelectedPoints(2);
              clickPt();
              return deselectPromise;
          })
          .then(function() {
              assertSelectionCleared();
              clickBox();
              return clickedPromise;
          })
          .then(function() {
              assertSelectionCleared();
          })
          .catch(failTest)
          .then(done);

        function clickPtImmediately() { return _immediateClickPt({ x: 610, y: 342 }); }
        function clickPt() { return _clickPt({ x: 610, y: 342 }); }
        function clickBox() { return _clickPt({ x: 565, y: 329 }); }
    });

    describe('is disabled when clickmode does not include \'select\'', function() {
        ['select', 'lasso']
          .forEach(function(dragmode) {
              it('@flaky and dragmode is ' + dragmode, function(done) {
                  plotMock14({ clickmode: 'event', dragmode: dragmode })
                    .then(function() {
                        // Still, the plotly_selected event should be thrown,
                        // so return promise here
                        return _immediateClickPt(mock14Pts[1]);
                    })
                    .then(function() {
                        assertSelectionCleared();
                    })
                    .catch(failTest)
                    .then(done);
              });
          });
    });

    describe('is disabled when clickmode does not include \'select\'', function() {
        ['pan', 'zoom']
          .forEach(function(dragmode) {
              it('@flaky and dragmode is ' + dragmode, function(done) {
                  plotMock14({ clickmode: 'event', dragmode: dragmode })
                    .then(function() {
                        _immediateClickPt(mock14Pts[1]);
                        return clickedPromise;
                    })
                    .then(function() {
                        assertSelectionCleared();
                    })
                    .catch(failTest)
                    .then(done);
              });
          });
    });

    describe('is supported by', function() {
        // On loading mocks:
        // - Note, that `require` function calls are resolved at compile time
        //   and thus dynamically concatenated mock paths won't work.
        // - Some mocks don't specify a width and height, so this needs
        //   to be set explicitly to ensure click coordinates fit.

        // The non-gl traces: use @flaky CI annotation
        [
            testCase('histrogram', require('@mocks/histogram_colorscale.json'), 355, 301, [3, 4, 5]),
            testCase('box', require('@mocks/box_grouped_horz.json'), 610, 342, [[2], [], []],
              { width: 1100, height: 450 }),
            testCase('violin', require('@mocks/violin_grouped.json'), 166, 187, [[3], [], []],
              { width: 1100, height: 450 }),
            testCase('ohlc', require('@mocks/ohlc_first.json'), 669, 165, [9]),
            testCase('candlestick', require('@mocks/finance_style.json'), 331, 162, [[], [5]]),
            testCase('choropleth', require('@mocks/geo_choropleth-text.json'), 440, 163, [6]),
            testCase('scattergeo', require('@mocks/geo_scattergeo-locations.json'), 285, 240, [1]),
            testCase('scatterternary', require('@mocks/ternary_markers.json'), 485, 335, [7]),

            // Note that first trace (carpet) in mock doesn't support selection,
            // thus undefined is expected
            testCase('scattercarpet', require('@mocks/scattercarpet.json'), 532, 178,
              [undefined, [], [], [], [], [], [2]], { width: 1100, height: 450 }),

            // scatterpolar and scatterpolargl do not support pan (the default),
            // so set dragmode to zoom
            testCase('scatterpolar', require('@mocks/polar_scatter.json'), 130, 290,
              [[], [], [], [19], [], []], { dragmode: 'zoom' }),
        ]
          .forEach(function(testCase) {
              it('@flaky trace type ' + testCase.label, function(done) {
                  _run(testCase, done);
              });
          });

        // The gl and mapbox traces: use @gl and @noCI tag
        [
            testCase('scatterpolargl', require('@mocks/glpolar_scatter.json'), 130, 290,
              [[], [], [], [19], [], []], { dragmode: 'zoom' }),
            testCase('splom', require('@mocks/splom_lower.json'), 427, 400, [[], [7], []]),
            testCase('scattermapbox', require('@mocks/mapbox_0.json'), 650, 195, [[2], []], {},
              { mapboxAccessToken: require('@build/credentials.json').MAPBOX_ACCESS_TOKEN })
        ]
          .forEach(function(testCase) {
              it('@gl trace type ' + testCase.label, function(done) {
                  _run(testCase, done);
              });
          });

        function _run(testCase, doneFn) {
            Plotly.plot(gd, testCase.mock.data, testCase.mock.layout, testCase.mock.config)
              .then(function() {
                  return _immediateClickPt(testCase);
              })
              .then(function() {
                  assertSelectedPoints(testCase.expectedPts);
                  return Plotly.relayout(gd, 'dragmode', 'lasso');
              })
              .then(function() {
                  _clickPt(testCase);
                  return deselectPromise;
              })
              .then(function() {
                  assertSelectionCleared();
                  return _clickPt(testCase);
              })
              .then(function() {
                  assertSelectedPoints(testCase.expectedPts);
              })
              .catch(failTest)
              .then(doneFn);
        }
    });

    describe('triggers \'plotly_selected\' before \'plotly_click\'', function() {
        [
            testCase('cartesian', require('@mocks/14.json'), 270, 160, [7]),
            testCase('geo', require('@mocks/geo_scattergeo-locations.json'), 285, 240, [1]),
            testCase('ternary', require('@mocks/ternary_markers.json'), 485, 335, [7]),
            testCase('polar', require('@mocks/polar_scatter.json'), 130, 290,
              [[], [], [], [19], [], []], { dragmode: 'zoom' })
        ].forEach(function(testCase) {
            it('@flaky for base plot ' + testCase.label, function(done) {
                _run(testCase, done);
            });
        });

        // The mapbox traces: use @noCI annotation cause they are usually too resource-intensive
        [
            testCase('mapbox', require('@mocks/mapbox_0.json'), 650, 195, [[2], []], {},
              { mapboxAccessToken: require('@build/credentials.json').MAPBOX_ACCESS_TOKEN })
        ].forEach(function(testCase) {
            it('@noCI for base plot ' + testCase.label, function(done) {
                _run(testCase, done);
            });
        });

        function _run(testCase, doneFn) {
            Plotly.plot(gd, testCase.mock.data, testCase.mock.layout, testCase.mock.config)
              .then(function() {
                  var clickHandlerCalled = false;
                  var selectedHandlerCalled = false;

                  gd.on('plotly_selected', function() {
                      expect(clickHandlerCalled).toBe(false);
                      selectedHandlerCalled = true;
                  });
                  gd.on('plotly_click', function() {
                      clickHandlerCalled = true;
                      expect(selectedHandlerCalled).toBe(true);
                      doneFn();
                  });

                  return click(testCase.x, testCase.y);
              })
              .catch(failTest)
              .then(doneFn);
        }
    });

    function testCase(label, mock, x, y, expectedPts, layoutOptions, configOptions) {
        var defaultLayoutOpts = {
            layout: {
                clickmode: 'event+select',
                dragmode: 'pan',
                hovermode: 'closest'
            }
        };
        var customLayoutOptions = {
            layout: layoutOptions
        };
        var customConfigOptions = {
            config: configOptions
        };
        var mockCopy = Lib.extendDeep(
          {},
          mock,
          defaultLayoutOpts,
          customLayoutOptions,
          customConfigOptions);

        return {
            label: label,
            mock: mockCopy,
            layoutOptions: layoutOptions,
            x: x,
            y: y,
            expectedPts: expectedPts,
            configOptions: configOptions
        };
    }
});

describe('Test select box and lasso in general:', function() {
    var mock = require('@mocks/14.json');
    var selectPath = [[93, 193], [143, 193]];
    var lassoPath = [[316, 171], [318, 239], [335, 243], [328, 169]];

    afterEach(destroyGraphDiv);

    function assertRange(actual, expected) {
        var PRECISION = 4;

        expect(actual.x).toBeCloseToArray(expected.x, PRECISION);
        expect(actual.y).toBeCloseToArray(expected.y, PRECISION);
    }

    function assertEventData(actual, expected, msg) {
        expect(actual.length).toBe(expected.length, msg + ' same number of pts');

        expected.forEach(function(e, i) {
            var a = actual[i];
            var m = msg + ' (pt ' + i + ')';

            expect(a.data).toBeDefined(m + ' has data ref');
            expect(a.fullData).toBeDefined(m + ' has fullData ref');
            expect(Object.keys(a).length - 2).toBe(Object.keys(e).length, m + ' has correct number of keys');

            Object.keys(e).forEach(function(k) {
                expect(a[k]).toBe(e[k], m + ' ' + k);
            });
        });
    }

    describe('select events', function() {
        var mockCopy = Lib.extendDeep({}, mock);
        mockCopy.layout.dragmode = 'select';
        mockCopy.layout.hovermode = 'closest';
        mockCopy.data[0].ids = mockCopy.data[0].x
            .map(function(v) { return 'id-' + v; });
        mockCopy.data[0].customdata = mockCopy.data[0].y
            .map(function(v) { return 'customdata-' + v; });
        addInvisible(mockCopy);

        var gd;
        beforeEach(function(done) {
            gd = createGraphDiv();

            Plotly.plot(gd, mockCopy.data, mockCopy.layout)
                .then(done);
        });

        it('@flaky should trigger selecting/selected/deselect events', function(done) {
            resetEvents(gd);

            drag(selectPath);

            selectedPromise.then(function() {
                expect(selectedCnt).toBe(1, 'with the correct selected count');
                assertEventData(selectedData.points, [{
                    curveNumber: 0,
                    pointNumber: 0,
                    pointIndex: 0,
                    x: 0.002,
                    y: 16.25,
                    id: 'id-0.002',
                    customdata: 'customdata-16.25'
                }, {
                    curveNumber: 0,
                    pointNumber: 1,
                    pointIndex: 1,
                    x: 0.004,
                    y: 12.5,
                    id: 'id-0.004',
                    customdata: 'customdata-12.5'
                }], 'with the correct selected points (2)');
                assertRange(selectedData.range, {
                    x: [0.002000, 0.0046236],
                    y: [0.10209191961595454, 24.512223978291406]
                }, 'with the correct selected range');

                return doubleClick(250, 200);
            })
            .then(deselectPromise)
            .then(function() {
                expect(doubleClickData).toBe(null, 'with the correct deselect data');
            })
            .catch(failTest)
            .then(done);
        });

        it('@flaky should handle add/sub selection', function(done) {
            resetEvents(gd);

            drag(selectPath);

            selectedPromise.then(function() {
                expect(selectingCnt).toBe(1, 'with the correct selecting count');
                assertEventData(selectingData.points, [{
                    curveNumber: 0,
                    pointNumber: 0,
                    pointIndex: 0,
                    x: 0.002,
                    y: 16.25,
                    id: 'id-0.002',
                    customdata: 'customdata-16.25'
                }, {
                    curveNumber: 0,
                    pointNumber: 1,
                    pointIndex: 1,
                    x: 0.004,
                    y: 12.5,
                    id: 'id-0.004',
                    customdata: 'customdata-12.5'
                }], 'with the correct selecting points (1)');
                assertRange(selectingData.range, {
                    x: [0.002000, 0.0046236],
                    y: [0.10209191961595454, 24.512223978291406]
                }, 'with the correct selecting range');
            })
            .then(function() {
                // add selection
                drag([[193, 193], [213, 193]], {shiftKey: true});
            })
            .then(function() {
                expect(selectingCnt).toBe(2, 'with the correct selecting count');
                assertEventData(selectingData.points, [{
                    curveNumber: 0,
                    pointNumber: 0,
                    pointIndex: 0,
                    x: 0.002,
                    y: 16.25,
                    id: 'id-0.002',
                    customdata: 'customdata-16.25'
                }, {
                    curveNumber: 0,
                    pointNumber: 1,
                    pointIndex: 1,
                    x: 0.004,
                    y: 12.5,
                    id: 'id-0.004',
                    customdata: 'customdata-12.5'
                }, {
                    curveNumber: 0,
                    pointNumber: 4,
                    pointIndex: 4,
                    x: 0.013,
                    y: 6.875,
                    id: 'id-0.013',
                    customdata: 'customdata-6.875'
                }], 'with the correct selecting points (1)');
            })
            .then(function() {
                // sub selection
                drag([[219, 143], [219, 183]], {altKey: true});
            }).then(function() {
                assertEventData(selectingData.points, [{
                    curveNumber: 0,
                    pointNumber: 0,
                    pointIndex: 0,
                    x: 0.002,
                    y: 16.25,
                    id: 'id-0.002',
                    customdata: 'customdata-16.25'
                }, {
                    curveNumber: 0,
                    pointNumber: 1,
                    pointIndex: 1,
                    x: 0.004,
                    y: 12.5,
                    id: 'id-0.004',
                    customdata: 'customdata-12.5'
                }], 'with the correct selecting points (1)');

                return doubleClick(250, 200);
            })
            .then(function() {
                expect(doubleClickData).toBe(null, 'with the correct deselect data');
            })
            .catch(failTest)
            .then(done);
        });
    });

    describe('lasso events', function() {
        var mockCopy = Lib.extendDeep({}, mock);
        mockCopy.layout.dragmode = 'lasso';
        mockCopy.layout.hovermode = 'closest';
        addInvisible(mockCopy);

        var gd;
        beforeEach(function(done) {
            gd = createGraphDiv();

            Plotly.plot(gd, mockCopy.data, mockCopy.layout)
                .then(done);
        });

        it('@flaky should trigger selecting/selected/deselect events', function(done) {
            resetEvents(gd);

            drag(lassoPath);

            selectedPromise.then(function() {
                expect(selectingCnt).toBe(3, 'with the correct selecting count');
                assertEventData(selectingData.points, [{
                    curveNumber: 0,
                    pointNumber: 10,
                    pointIndex: 10,
                    x: 0.099,
                    y: 2.75
                }], 'with the correct selecting points (1)');

                expect(selectedCnt).toBe(1, 'with the correct selected count');
                assertEventData(selectedData.points, [{
                    curveNumber: 0,
                    pointNumber: 10,
                    pointIndex: 10,
                    x: 0.099,
                    y: 2.75,
                }], 'with the correct selected points (2)');

                expect(selectedData.lassoPoints.x).toBeCloseToArray(
                    [0.084, 0.087, 0.115, 0.103], 'lasso points x coords');
                expect(selectedData.lassoPoints.y).toBeCloseToArray(
                    [4.648, 1.342, 1.247, 4.821], 'lasso points y coords');

                return doubleClick(250, 200);
            })
            .then(deselectPromise)
            .then(function() {
                expect(doubleClickData).toBe(null, 'with the correct deselect data');
            })
            .catch(failTest)
            .then(done);
        });

        it('@flaky should set selected points in graph data', function(done) {
            resetEvents(gd);

            drag(lassoPath);

            selectedPromise.then(function() {
                expect(selectingCnt).toBe(3, 'with the correct selecting count');
                expect(gd.data[0].selectedpoints).toEqual([10]);

                return doubleClick(250, 200);
            })
            .then(deselectPromise)
            .then(function() {
                expect(gd.data[0].selectedpoints).toBeUndefined();
            })
            .catch(failTest)
            .then(done);
        });

        it('@flaky should set selected points in full data', function(done) {
            resetEvents(gd);

            drag(lassoPath);

            selectedPromise.then(function() {
                expect(selectingCnt).toBe(3, 'with the correct selecting count');
                expect(gd._fullData[0].selectedpoints).toEqual([10]);

                return doubleClick(250, 200);
            })
            .then(deselectPromise)
            .then(function() {
                expect(gd._fullData[0].selectedpoints).toBeUndefined();
            })
            .catch(failTest)
            .then(done);
        });

        it('@flaky should trigger selecting/selected/deselect events for touches', function(done) {
            resetEvents(gd);

            drag(lassoPath, {type: 'touch'});

            selectedPromise.then(function() {
                expect(selectingCnt).toBe(3, 'with the correct selecting count');
                assertEventData(selectingData.points, [{
                    curveNumber: 0,
                    pointNumber: 10,
                    pointIndex: 10,
                    x: 0.099,
                    y: 2.75
                }], 'with the correct selecting points (1)');

                expect(selectedCnt).toBe(1, 'with the correct selected count');
                assertEventData(selectedData.points, [{
                    curveNumber: 0,
                    pointNumber: 10,
                    pointIndex: 10,
                    x: 0.099,
                    y: 2.75,
                }], 'with the correct selected points (2)');

                return doubleClick(250, 200);
            })
            .then(deselectPromise)
            .then(function() {
                expect(doubleClickData).toBe(null, 'with the correct deselect data');
            })
            .catch(failTest)
            .then(done);
        });
    });

    it('@flaky should skip over non-visible traces', function(done) {
        // note: this tests a mock with one or several invisible traces
        // the invisible traces in the other tests test for multiple
        // traces, with some visible and some not.
        var mockCopy = Lib.extendDeep({}, mock);
        mockCopy.layout.dragmode = 'select';

        var gd = createGraphDiv();

        function resetAndSelect() {
            resetEvents(gd);
            drag(selectPath);
            return selectedPromise;
        }

        function resetAndLasso() {
            resetEvents(gd);
            drag(lassoPath);
            return selectedPromise;
        }

        function checkPointCount(cnt, msg) {
            expect((selectedData.points || []).length).toBe(cnt, msg);
        }

        Plotly.plot(gd, mockCopy.data, mockCopy.layout)
        .then(resetAndSelect)
        .then(function() {
            checkPointCount(2, '(case 0)');

            return Plotly.restyle(gd, 'visible', 'legendonly');
        })
        .then(resetAndSelect)
        .then(function() {
            checkPointCount(0, '(legendonly case)');

            return Plotly.restyle(gd, 'visible', true);
        })
        .then(resetAndSelect)
        .then(function() {
            checkPointCount(2, '(back to case 0)');

            return Plotly.relayout(gd, 'dragmode', 'lasso');
        })
        .then(resetAndLasso)
        .then(function() {
            checkPointCount(1, '(case 0 lasso)');

            return Plotly.restyle(gd, 'visible', 'legendonly');
        })
        .then(resetAndSelect)
        .then(function() {
            checkPointCount(0, '(lasso legendonly case)');

            return Plotly.restyle(gd, 'visible', true);
        })
        .then(resetAndLasso)
        .then(function() {
            checkPointCount(1, '(back to lasso case 0)');

            mockCopy = Lib.extendDeep({}, mock);
            mockCopy.layout.dragmode = 'select';
            mockCopy.data[0].visible = false;
            addInvisible(mockCopy);
            return Plotly.newPlot(gd, mockCopy);
        })
        .then(resetAndSelect)
        .then(function() {
            checkPointCount(0, '(multiple invisible traces select)');
            return Plotly.relayout(gd, 'dragmode', 'lasso');
        })
        .then(resetAndLasso)
        .then(function() {
            checkPointCount(0, '(multiple invisible traces lasso)');
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should skip over BADNUM items', function(done) {
        var data = [{
            mode: 'markers',
            x: [null, undefined, NaN, 0, 'NA'],
            y: [NaN, null, undefined, 0, 'NA']
        }];
        var layout = {
            dragmode: 'select',
            width: 400,
            heigth: 400,
        };
        var gd = createGraphDiv();

        Plotly.plot(gd, data, layout).then(function() {
            resetEvents(gd);
            drag([[100, 100], [300, 300]]);
            return selectedPromise;
        })
        .then(function() {
            expect(selectedData.points.length).toBe(1);
            expect(selectedData.points[0].x).toBe(0);
            expect(selectedData.points[0].y).toBe(0);

            return Plotly.relayout(gd, 'dragmode', 'lasso');
        })
        .then(function() {
            resetEvents(gd);
            drag([[100, 100], [100, 300], [300, 300], [300, 100], [100, 100]]);
            return selectedPromise;
        })
        .then(function() {
            expect(selectedData.points.length).toBe(1);
            expect(selectedData.points[0].x).toBe(0);
            expect(selectedData.points[0].y).toBe(0);
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky scroll zoom should clear selection regions', function(done) {
        var gd = createGraphDiv();
        var mockCopy = Lib.extendDeep({}, mock);
        mockCopy.layout.dragmode = 'select';
        mockCopy.config = {scrollZoom: true};

        function _drag() {
            resetEvents(gd);
            drag(selectPath);
            return selectedPromise;
        }

        function _scroll() {
            mouseEvent('mousemove', selectPath[0][0], selectPath[0][1]);
            mouseEvent('scroll', selectPath[0][0], selectPath[0][1], {deltaX: 0, deltaY: -20});
        }

        Plotly.plot(gd, mockCopy)
        .then(_drag)
        .then(_scroll)
        .then(function() {
            assertSelectionNodes(0, 0);
        })
        .then(_drag)
        .then(_scroll)
        .then(function() {
            // make sure it works the 2nd time aroung
            assertSelectionNodes(0, 0);
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should have their selection outlines cleared during *axrange* relayout calls', function(done) {
        var gd = createGraphDiv();
        var fig = Lib.extendDeep({}, mock);
        fig.layout.dragmode = 'select';

        function _drag() {
            resetEvents(gd);
            drag(selectPath);
            return selectedPromise;
        }

        Plotly.plot(gd, fig)
        .then(_drag)
        .then(function() { assertSelectionNodes(0, 2, 'after drag 1'); })
        .then(function() { return Plotly.relayout(gd, 'xaxis.range', [-5, 5]); })
        .then(function() { assertSelectionNodes(0, 0, 'after axrange relayout'); })
        .then(_drag)
        .then(function() { assertSelectionNodes(0, 2, 'after drag 2'); })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should select the right data with the corresponding select direction', function(done) {
        var gd = createGraphDiv();

        // drag around just the center point, but if we have a selectdirection we may
        // get either the ones to the left and right or above and below
        var selectPath = [[175, 175], [225, 225]];

        function selectDrag() {
            resetEvents(gd);
            drag(selectPath);
            return selectedPromise;
        }

        function assertSelectedPointNumbers(pointNumbers) {
            var pts = selectedData.points;
            expect(pts.length).toBe(pointNumbers.length);
            pointNumbers.forEach(function(pointNumber, i) {
                expect(pts[i].pointNumber).toBe(pointNumber);
            });
        }

        Plotly.newPlot(gd, [{
            x: [1, 1, 1, 2, 2, 2, 3, 3, 3],
            y: [1, 2, 3, 1, 2, 3, 1, 2, 3],
            mode: 'markers'
        }], {
            width: 400,
            height: 400,
            dragmode: 'select',
            margin: {l: 100, r: 100, t: 100, b: 100},
            xaxis: {range: [0, 4]},
            yaxis: {range: [0, 4]}
        })
        .then(selectDrag)
        .then(function() {
            expect(gd._fullLayout.selectdirection).toBe('any');
            assertSelectedPointNumbers([4]);

            return Plotly.relayout(gd, {selectdirection: 'h'});
        })
        .then(selectDrag)
        .then(function() {
            assertSelectedPointNumbers([3, 4, 5]);

            return Plotly.relayout(gd, {selectdirection: 'v'});
        })
        .then(selectDrag)
        .then(function() {
            assertSelectedPointNumbers([1, 4, 7]);

            return Plotly.relayout(gd, {selectdirection: 'd'});
        })
        .then(selectDrag)
        .then(function() {
            assertSelectedPointNumbers([4]);
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should cleanly clear and restart selections on double click when add/subtract mode on', function(done) {
        var gd = createGraphDiv();
        var fig = Lib.extendDeep({}, require('@mocks/0.json'));

        fig.layout.dragmode = 'select';
        Plotly.plot(gd, fig)
          .then(function() {
              return drag([[350, 100], [400, 400]]);
          })
          .then(function() {
              _assertSelectedPoints([49, 50, 51, 52, 53, 54, 55, 56, 57]);

              // Note: although Shift has no behavioral effect on clearing a selection
              // with a double click, users might hold the Shift key by accident.
              // This test ensures selection is cleared as expected although
              // the Shift key is held and no selection state is retained in any way.
              return doubleClick(500, 200, { shiftKey: true });
          })
          .then(function() {
              _assertSelectedPoints(null);
              return drag([[450, 100], [500, 400]], { shiftKey: true });
          })
          .then(function() {
              _assertSelectedPoints([67, 68, 69, 70, 71, 72, 73, 74]);
          })
          .catch(failTest)
          .then(done);

        function _assertSelectedPoints(selPts) {
            if(selPts) {
                expect(gd.data[0].selectedpoints).toEqual(selPts);
            } else {
                expect('selectedpoints' in gd.data[0]).toBe(false);
            }
        }
    });

    it('@flaky should clear selected points on double click only on pan/lasso modes', function(done) {
        var gd = createGraphDiv();
        var fig = Lib.extendDeep({}, require('@mocks/0.json'));
        fig.data = [fig.data[0]];
        fig.layout.xaxis.autorange = false;
        fig.layout.xaxis.range = [2, 8];
        fig.layout.yaxis.autorange = false;
        fig.layout.yaxis.range = [0, 3];
        fig.layout.hovermode = 'closest';

        function _assert(msg, exp) {
            expect(gd.layout.xaxis.range)
                .toBeCloseToArray(exp.xrng, 2, 'xaxis range - ' + msg);
            expect(gd.layout.yaxis.range)
                .toBeCloseToArray(exp.yrng, 2, 'yaxis range - ' + msg);

            if(exp.selpts === null) {
                expect('selectedpoints' in gd.data[0])
                    .toBe(false, 'cleared selectedpoints - ' + msg);
            } else {
                expect(gd.data[0].selectedpoints)
                    .toBeCloseToArray(exp.selpts, 2, 'selectedpoints - ' + msg);
            }
        }

        Plotly.plot(gd, fig).then(function() {
            _assert('base', {
                xrng: [2, 8],
                yrng: [0, 3],
                selpts: null
            });
            return Plotly.relayout(gd, 'xaxis.range', [0, 10]);
        })
        .then(function() {
            _assert('after xrng relayout', {
                xrng: [0, 10],
                yrng: [0, 3],
                selpts: null
            });
            return doubleClick(200, 200);
        })
        .then(function() {
            _assert('after double-click under dragmode zoom', {
                xrng: [2, 8],
                yrng: [0, 3],
                selpts: null
            });
            return Plotly.relayout(gd, 'dragmode', 'select');
        })
        .then(function() {
            _assert('after relayout to select', {
                xrng: [2, 8],
                yrng: [0, 3],
                selpts: null
            });
            return drag([[100, 100], [400, 400]]);
        })
        .then(function() {
            _assert('after selection', {
                xrng: [2, 8],
                yrng: [0, 3],
                selpts: [40, 41, 42, 43, 44, 45, 46, 47, 48]
            });
            return doubleClick(200, 200);
        })
        .then(function() {
            _assert('after double-click under dragmode select', {
                xrng: [2, 8],
                yrng: [0, 3],
                selpts: null
            });
            return drag([[100, 100], [400, 400]]);
        })
        .then(function() {
            _assert('after selection 2', {
                xrng: [2, 8],
                yrng: [0, 3],
                selpts: [40, 41, 42, 43, 44, 45, 46, 47, 48]
            });
            return Plotly.relayout(gd, 'dragmode', 'pan');
        })
        .then(function() {
            _assert('after relayout to pan', {
                xrng: [2, 8],
                yrng: [0, 3],
                selpts: [40, 41, 42, 43, 44, 45, 46, 47, 48]
            });
            return Plotly.relayout(gd, 'yaxis.range', [0, 20]);
        })
        .then(function() {
            _assert('after yrng relayout', {
                xrng: [2, 8],
                yrng: [0, 20],
                selpts: [40, 41, 42, 43, 44, 45, 46, 47, 48]
            });
            return doubleClick(200, 200);
        })
        .then(function() {
            _assert('after double-click under dragmode pan', {
                xrng: [2, 8],
                yrng: [0, 3],
                // N.B. does not clear selection!
                selpts: [40, 41, 42, 43, 44, 45, 46, 47, 48]
            });
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should remember selection polygons from previous select/lasso mode', function(done) {
        var gd = createGraphDiv();
        var path1 = [[150, 150], [170, 170]];
        var path2 = [[193, 193], [213, 193]];

        var fig = Lib.extendDeep({}, mock);
        fig.layout.margin = {l: 0, t: 0, r: 0, b: 0};
        fig.layout.width = 500;
        fig.layout.height = 500;
        fig.layout.dragmode = 'select';
        fig.config = {scrollZoom: true};

        // d attr to array of segment [x,y]
        function outline2coords(outline) {
            if(!outline.size()) return [[]];

            return outline.attr('d')
                .replace(/Z/g, '')
                .split('M')
                .filter(Boolean)
                .map(function(s) {
                    return s.split('L')
                        .map(function(s) { return s.split(',').map(Number); });
                })
                .reduce(function(a, b) { return a.concat(b); });
        }

        function _assert(msg, exp) {
            var outline = d3.select(gd).select('.zoomlayer').select('.select-outline-1');

            if(exp.outline) {
                expect(outline2coords(outline)).toBeCloseTo2DArray(exp.outline, 2, msg);
            } else {
                assertSelectionNodes(0, 0, msg);
            }
        }

        function _drag(path, opts) {
            return function() {
                resetEvents(gd);
                drag(path, opts);
                return selectedPromise;
            };
        }

        Plotly.plot(gd, fig)
        .then(function() { _assert('base', {outline: false}); })
        .then(_drag(path1))
        .then(function() {
            _assert('select path1', {
                outline: [[150, 150], [150, 170], [170, 170], [170, 150], [150, 150]]
            });
        })
        .then(_drag(path2))
        .then(function() {
            _assert('select path2', {
                outline: [[193, 0], [193, 500], [213, 500], [213, 0], [193, 0]]
            });
        })
        .then(_drag(path1))
        .then(_drag(path2, {shiftKey: true}))
        .then(function() {
            _assert('select path1+path2', {
                outline: [
                    [170, 170], [170, 150], [150, 150], [150, 170], [170, 170],
                    [213, 500], [213, 0], [193, 0], [193, 500], [213, 500]
                ]
            });
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'lasso');
        })
        .then(function() {
            // N.B. all relayout calls clear the selection outline at the moment,
            // perhaps we could make an exception for select <-> lasso ?
            _assert('after relayout -> lasso', {outline: false});
        })
        .then(_drag(lassoPath, {shiftKey: true}))
        .then(function() {
            // merged with previous 'select' polygon
            _assert('after shift lasso', {
                outline: [
                    [170, 170], [170, 150], [150, 150], [150, 170], [170, 170],
                    [213, 500], [213, 0], [193, 0], [193, 500], [213, 500],
                    [335, 243], [328, 169], [316, 171], [318, 239], [335, 243]
                ]
            });
        })
        .then(_drag(lassoPath))
        .then(function() {
            _assert('after lasso (no-shift)', {
                outline: [[316, 171], [318, 239], [335, 243], [328, 169], [316, 171]]
            });
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'pan');
        })
        .then(function() {
            _assert('after relayout -> pan', {outline: false});
            drag(path2);
            _assert('after pan', {outline: false});
            return Plotly.relayout(gd, 'dragmode', 'select');
        })
        .then(function() {
            _assert('after relayout back to select', {outline: false});
        })
        .then(_drag(path1, {shiftKey: true}))
        .then(function() {
            // this used to merged 'lasso' polygons before (see #2669)
            _assert('shift select path1 after pan', {
                outline: [[150, 150], [150, 170], [170, 170], [170, 150], [150, 150]]
            });
        })
        .then(_drag(path2, {shiftKey: true}))
        .then(function() {
            _assert('shift select path1+path2 after pan', {
                outline: [
                    [170, 170], [170, 150], [150, 150], [150, 170], [170, 170],
                    [213, 500], [213, 0], [193, 0], [193, 500], [213, 500]
                ]
            });
        })
        .then(function() {
            mouseEvent('mousemove', 200, 200);
            mouseEvent('scroll', 200, 200, {deltaX: 0, deltaY: -20});
        })
        .then(_drag(path1, {shiftKey: true}))
        .then(function() {
            _assert('shift select path1 after scroll', {
                outline: [[150, 150], [150, 170], [170, 170], [170, 150], [150, 150]]
            });
        })
        .catch(failTest)
        .then(done);
    });
});

describe('Test select box and lasso per trace:', function() {
    var gd;

    beforeEach(function() {
        gd = createGraphDiv();
        spyOn(Lib, 'error');
    });

    afterEach(destroyGraphDiv);

    function makeAssertPoints(keys) {
        var callNumber = 0;

        return function(expected) {
            var msg = '(call #' + callNumber + ') ';
            var pts = (selectedData || {}).points || [];

            expect(pts.length).toBe(expected.length, msg + 'selected points length');

            pts.forEach(function(p, i) {
                var e = expected[i] || [];
                keys.forEach(function(k, j) {
                    var msgFull = msg + 'selected pt ' + i + ' - ' + k + ' val';

                    if(typeof p[k] === 'number' && typeof e[j] === 'number') {
                        expect(p[k]).toBeCloseTo(e[j], 1, msgFull);
                    } else if(Array.isArray(p[k]) && Array.isArray(e[j])) {
                        expect(p[k]).toBeCloseToArray(e[j], 1, msgFull);
                    } else {
                        expect(p[k]).toBe(e[j], msgFull);
                    }
                });
            });

            callNumber++;
        };
    }

    function makeAssertSelectedPoints() {
        var callNumber = 0;

        return function(expected) {
            var msg = '(call #' + callNumber + ') ';

            gd.data.forEach(function(trace, i) {
                var msgFull = msg + 'selectedpoints array for trace ' + i;
                var actual = trace.selectedpoints;

                if(expected[i]) {
                    expect(actual).toBeCloseToArray(expected[i], 1, msgFull);
                } else {
                    expect(actual).toBe(undefined, 1, msgFull);
                }
            });

            callNumber++;
        };
    }

    function makeAssertRanges(subplot, tol) {
        tol = tol || 1;
        var callNumber = 0;

        return function(expected) {
            var msg = '(call #' + callNumber + ') select box range ';
            var ranges = selectedData.range || {};

            if(subplot) {
                expect(ranges[subplot] || [])
                    .toBeCloseTo2DArray(expected, tol, msg + 'for ' + subplot);
            } else {
                expect(ranges.x || [])
                    .toBeCloseToArray(expected[0], tol, msg + 'x coords');
                expect(ranges.y || [])
                    .toBeCloseToArray(expected[1], tol, msg + 'y coords');
            }

            callNumber++;
        };
    }

    function makeAssertLassoPoints(subplot, tol) {
        tol = tol || 1;
        var callNumber = 0;

        return function(expected) {
            var msg = '(call #' + callNumber + ') lasso points ';
            var lassoPoints = selectedData.lassoPoints || {};

            if(subplot) {
                expect(lassoPoints[subplot] || [])
                    .toBeCloseTo2DArray(expected, tol, msg + 'for ' + subplot);
            } else {
                expect(lassoPoints.x || [])
                    .toBeCloseToArray(expected[0], tol, msg + 'x coords');
                expect(lassoPoints.y || [])
                    .toBeCloseToArray(expected[1], tol, msg + 'y coords');
            }

            callNumber++;
        };
    }

    function _run(dragPath, afterDragFn, dblClickPos, eventCounts, msg) {
        afterDragFn = afterDragFn || function() {};
        dblClickPos = dblClickPos || [250, 200];

        resetEvents(gd);

        assertSelectionNodes(0, 0);
        drag(dragPath);

        return (eventCounts[0] ? selectedPromise : Promise.resolve())
            .then(afterDragFn)
            .then(function() {
                // TODO: in v2 when we remove the `plotly_selecting->undefined` the Math.max(...)
                // in the middle here will turn into just eventCounts[1].
                // It's just here because one of the selected events is generated during
                // doubleclick so hasn't happened yet when we're testing this.
                assertEventCounts(eventCounts[0], Math.max(0, eventCounts[1] - 1), 0, msg + ' (before dblclick)');
                return doubleClick(dblClickPos[0], dblClickPos[1]);
            })
            .then(eventCounts[2] ? deselectPromise : Promise.resolve())
            .then(function() {
                assertEventCounts(eventCounts[0], eventCounts[1], eventCounts[2], msg + ' (after dblclick)');
                expect(Lib.error).not.toHaveBeenCalled();
            });
    }

    it('@flaky should work on scatterternary traces', function(done) {
        var assertPoints = makeAssertPoints(['a', 'b', 'c']);
        var assertSelectedPoints = makeAssertSelectedPoints();

        var fig = Lib.extendDeep({}, require('@mocks/ternary_simple'));
        fig.layout.width = 800;
        fig.layout.dragmode = 'select';
        addInvisible(fig);

        Plotly.plot(gd, fig).then(function() {
            return _run(
                [[400, 200], [445, 235]],
                function() {
                    assertPoints([[0.5, 0.25, 0.25]]);
                    assertSelectedPoints({0: [0]});
                },
                [380, 180],
                BOXEVENTS, 'scatterternary select'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'lasso');
        })
        .then(function() {
            return _run(
                [[400, 200], [445, 200], [445, 235], [400, 235], [400, 200]],
                function() {
                    assertPoints([[0.5, 0.25, 0.25]]);
                    assertSelectedPoints({0: [0]});
                },
                [380, 180],
                LASSOEVENTS, 'scatterternary lasso'
            );
        })
        .then(function() {
            // should work after a relayout too
            return Plotly.relayout(gd, 'width', 400);
        })
        .then(function() {
            return _run(
                [[200, 200], [230, 200], [230, 230], [200, 230], [200, 200]],
                function() {
                    assertPoints([[0.5, 0.25, 0.25]]);
                    assertSelectedPoints({0: [0]});
                },
                [180, 180],
                LASSOEVENTS, 'scatterternary lasso after relayout'
            );
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should work on scattercarpet traces', function(done) {
        var assertPoints = makeAssertPoints(['a', 'b']);
        var assertSelectedPoints = makeAssertSelectedPoints();

        var fig = Lib.extendDeep({}, require('@mocks/scattercarpet'));
        delete fig.data[6].selectedpoints;
        fig.layout.dragmode = 'select';
        addInvisible(fig);

        Plotly.plot(gd, fig).then(function() {
            return _run(
                [[300, 200], [400, 250]],
                function() {
                    assertPoints([[0.2, 1.5]]);
                    assertSelectedPoints({1: [], 2: [], 3: [], 4: [], 5: [1], 6: []});
                },
                null, BOXEVENTS, 'scattercarpet select'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'lasso');
        })
        .then(function() {
            return _run(
                [[300, 200], [400, 200], [400, 250], [300, 250], [300, 200]],
                function() {
                    assertPoints([[0.2, 1.5]]);
                    assertSelectedPoints({1: [], 2: [], 3: [], 4: [], 5: [1], 6: []});
                },
                null, LASSOEVENTS, 'scattercarpet lasso'
            );
        })
        .catch(failTest)
        .then(done);
    });

    it('@noCI @flaky should work on scattermapbox traces', function(done) {
        var assertPoints = makeAssertPoints(['lon', 'lat']);
        var assertRanges = makeAssertRanges('mapbox');
        var assertLassoPoints = makeAssertLassoPoints('mapbox');
        var assertSelectedPoints = makeAssertSelectedPoints();

        var fig = Lib.extendDeep({}, require('@mocks/mapbox_bubbles-text'));

        fig.data[0].lon.push(null);
        fig.data[0].lat.push(null);

        fig.layout.dragmode = 'select';
        fig.config = {
            mapboxAccessToken: require('@build/credentials.json').MAPBOX_ACCESS_TOKEN
        };
        addInvisible(fig);

        Plotly.plot(gd, fig).then(function() {
            return _run(
                [[370, 120], [500, 200]],
                function() {
                    assertPoints([[30, 30]]);
                    assertRanges([[21.99, 34.55], [38.14, 25.98]]);
                    assertSelectedPoints({0: [2]});
                },
                null, BOXEVENTS, 'scattermapbox select'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'lasso');
        })
        .then(function() {
            return _run(
                [[300, 200], [300, 300], [400, 300], [400, 200], [300, 200]],
                function() {
                    assertPoints([[20, 20]]);
                    assertSelectedPoints({0: [1]});
                    assertLassoPoints([
                        [13.28, 25.97], [13.28, 14.33], [25.71, 14.33], [25.71, 25.97], [13.28, 25.97]
                    ]);
                },
                null, LASSOEVENTS, 'scattermapbox lasso'
            );
        })
        .then(function() {
            // make selection handlers don't get called in 'pan' dragmode
            return Plotly.relayout(gd, 'dragmode', 'pan');
        })
        .then(function() {
            return _run(
                [[370, 120], [500, 200]], null, null, NOEVENTS, 'scattermapbox pan'
            );
        })
        .catch(failTest)
        .then(done);
    }, LONG_TIMEOUT_INTERVAL);

    it('@flaky should work on scattergeo traces', function(done) {
        var assertPoints = makeAssertPoints(['lon', 'lat']);
        var assertSelectedPoints = makeAssertSelectedPoints();
        var assertRanges = makeAssertRanges('geo');
        var assertLassoPoints = makeAssertLassoPoints('geo');

        function assertNodeOpacity(exp) {
            var traces = d3.select(gd).selectAll('.scatterlayer > .trace');
            expect(traces.size()).toBe(Object.keys(exp).length, 'correct # of trace <g>');

            traces.each(function(_, i) {
                d3.select(this).selectAll('path.point').each(function(_, j) {
                    expect(Number(this.style.opacity))
                        .toBe(exp[i][j], 'node opacity - trace ' + i + ' pt ' + j);
                });
            });
        }

        var fig = {
            data: [{
                type: 'scattergeo',
                lon: [10, 20, 30, null],
                lat: [10, 20, 30, null]
            }, {
                type: 'scattergeo',
                lon: [-10, -20, -30],
                lat: [10, 20, 30]
            }],
            layout: {
                showlegend: false,
                dragmode: 'select',
                width: 800,
                height: 600
            }
        };
        addInvisible(fig);

        Plotly.plot(gd, fig)
        .then(function() {
            return _run(
                [[350, 200], [450, 400]],
                function() {
                    assertPoints([[10, 10], [20, 20], [-10, 10], [-20, 20]]);
                    assertSelectedPoints({0: [0, 1], 1: [0, 1]});
                    assertNodeOpacity({0: [1, 1, 0.2], 1: [1, 1, 0.2]});
                    assertRanges([[-28.13, 61.88], [28.13, -50.64]]);
                },
                null, BOXEVENTS, 'scattergeo select'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'lasso');
        })
        .then(function() {
            return _run(
                [[300, 200], [300, 300], [400, 300], [400, 200], [300, 200]],
                function() {
                    assertPoints([[-10, 10], [-20, 20], [-30, 30]]);
                    assertSelectedPoints({0: [], 1: [0, 1, 2]});
                    assertNodeOpacity({0: [0.2, 0.2, 0.2], 1: [1, 1, 1]});
                    assertLassoPoints([
                        [-56.25, 61.88], [-56.24, 5.63], [0, 5.63], [0, 61.88], [-56.25, 61.88]
                    ]);
                },
                null, LASSOEVENTS, 'scattergeo lasso'
            );
        })
        .then(function() {
            // some projection types can't handle BADNUM during c2p,
            // make they are skipped here
            return Plotly.relayout(gd, 'geo.projection.type', 'robinson');
        })
        .then(function() {
            return _run(
                [[300, 200], [300, 300], [400, 300], [400, 200], [300, 200]],
                function() {
                    assertPoints([[-10, 10], [-20, 20], [-30, 30]]);
                    assertSelectedPoints({0: [], 1: [0, 1, 2]});
                    assertNodeOpacity({0: [0.2, 0.2, 0.2], 1: [1, 1, 1]});
                    assertLassoPoints([
                        [-67.40, 55.07], [-56.33, 4.968], [0, 4.968], [0, 55.07], [-67.40, 55.07]
                    ]);
                },
                null, LASSOEVENTS, 'scattergeo lasso (on robinson projection)'
            );
        })
        .then(function() {
            // make sure selection handlers don't get called in 'pan' dragmode
            return Plotly.relayout(gd, 'dragmode', 'pan');
        })
        .then(function() {
            return _run(
                [[370, 120], [500, 200]], null, null, NOEVENTS, 'scattergeo pan'
            );
        })
        .catch(failTest)
        .then(done);
    }, LONG_TIMEOUT_INTERVAL);

    it('@flaky should work on scatterpolar traces', function(done) {
        var assertPoints = makeAssertPoints(['r', 'theta']);
        var assertSelectedPoints = makeAssertSelectedPoints();

        var fig = Lib.extendDeep({}, require('@mocks/polar_subplots'));
        fig.layout.width = 800;
        fig.layout.dragmode = 'select';
        addInvisible(fig);

        Plotly.plot(gd, fig).then(function() {
            return _run(
                [[150, 150], [350, 250]],
                function() {
                    assertPoints([[1, 0], [2, 45]]);
                    assertSelectedPoints({0: [0, 1]});
                },
                [200, 200],
                BOXEVENTS, 'scatterpolar select'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'lasso');
        })
        .then(function() {
            return _run(
                [[150, 150], [350, 150], [350, 250], [150, 250], [150, 150]],
                function() {
                    assertPoints([[1, 0], [2, 45]]);
                    assertSelectedPoints({0: [0, 1]});
                },
                [200, 200],
                LASSOEVENTS, 'scatterpolar lasso'
            );
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should work on barpolar traces', function(done) {
        var assertPoints = makeAssertPoints(['r', 'theta']);
        var assertSelectedPoints = makeAssertSelectedPoints();

        var fig = Lib.extendDeep({}, require('@mocks/polar_wind-rose.json'));
        fig.layout.showlegend = false;
        fig.layout.width = 500;
        fig.layout.height = 500;
        fig.layout.dragmode = 'select';
        addInvisible(fig);

        Plotly.plot(gd, fig).then(function() {
            return _run(
                [[150, 150], [250, 250]],
                function() {
                    assertPoints([
                        [62.5, 'N-W'], [55, 'N-W'], [40, 'North'],
                        [40, 'N-W'], [20, 'North'], [22.5, 'N-W']
                    ]);
                    assertSelectedPoints({
                        0: [7],
                        1: [7],
                        2: [0, 7],
                        3: [0, 7]
                    });
                },
                [200, 200],
                BOXEVENTS, 'barpolar select'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'lasso');
        })
        .then(function() {
            return _run(
                [[150, 150], [350, 150], [350, 250], [150, 250], [150, 150]],
                function() {
                    assertPoints([
                        [62.5, 'N-W'], [50, 'N-E'], [55, 'N-W'], [40, 'North'],
                        [30, 'N-E'], [40, 'N-W'], [20, 'North'], [7.5, 'N-E'], [22.5, 'N-W']
                    ]);
                    assertSelectedPoints({
                        0: [7],
                        1: [1, 7],
                        2: [0, 1, 7],
                        3: [0, 1, 7]
                    });
                },
                [200, 200],
                LASSOEVENTS, 'barpolar lasso'
            );
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should work on choropleth traces', function(done) {
        var assertPoints = makeAssertPoints(['location', 'z']);
        var assertSelectedPoints = makeAssertSelectedPoints();
        var assertRanges = makeAssertRanges('geo', -0.5);
        var assertLassoPoints = makeAssertLassoPoints('geo', -0.5);

        var fig = Lib.extendDeep({}, require('@mocks/geo_choropleth-text'));
        fig.layout.width = 870;
        fig.layout.height = 450;
        fig.layout.dragmode = 'select';
        fig.layout.geo.scope = 'europe';
        addInvisible(fig, false);

        // add a trace with no locations which will then make trace invisible, lacking DOM elements
        var emptyChoroplethTrace = Lib.extendDeep({}, fig.data[0]);
        emptyChoroplethTrace.text = [];
        emptyChoroplethTrace.locations = [];
        emptyChoroplethTrace.z = [];
        fig.data.push(emptyChoroplethTrace);

        Plotly.plot(gd, fig)
        .then(function() {
            return _run(
                [[350, 200], [400, 250]],
                function() {
                    assertPoints([['GBR', 26.507354205352502], ['IRL', 86.4125147625692]]);
                    assertSelectedPoints({0: [43, 54]});
                    assertRanges([[-19.11, 63.06], [7.31, 53.72]]);
                },
                [280, 190],
                BOXEVENTS, 'choropleth select'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'lasso');
        })
        .then(function() {
            return _run(
                [[350, 200], [400, 200], [400, 250], [350, 250], [350, 200]],
                function() {
                    assertPoints([['GBR', 26.507354205352502], ['IRL', 86.4125147625692]]);
                    assertSelectedPoints({0: [43, 54]});
                    assertLassoPoints([
                        [-19.11, 63.06], [5.50, 65.25], [7.31, 53.72], [-12.90, 51.70], [-19.11, 63.06]
                    ]);
                },
                [280, 190],
                LASSOEVENTS, 'choropleth lasso'
            );
        })
        .then(function() {
            // make selection handlers don't get called in 'pan' dragmode
            return Plotly.relayout(gd, 'dragmode', 'pan');
        })
        .then(function() {
            return _run(
                [[370, 120], [500, 200]], null, [200, 180], NOEVENTS, 'choropleth pan'
            );
        })
        .catch(failTest)
        .then(done);
    }, LONG_TIMEOUT_INTERVAL);

    it('@noCI @flaky should work for waterfall traces', function(done) {
        var assertPoints = makeAssertPoints(['curveNumber', 'x', 'y']);
        var assertSelectedPoints = makeAssertSelectedPoints();
        var assertRanges = makeAssertRanges();
        var assertLassoPoints = makeAssertLassoPoints();

        var fig = Lib.extendDeep({}, require('@mocks/waterfall_profit-loss_2018_positive-negative'));
        fig.layout.dragmode = 'lasso';
        addInvisible(fig);

        Plotly.plot(gd, fig)
        .then(function() {
            return _run(
                [[400, 300], [200, 400], [400, 500], [600, 400], [500, 350]],
                function() {
                    assertPoints([
                        [0, 281, 'Purchases'],
                        [0, 269, 'Material expenses'],
                        [0, 191, 'Personnel expenses'],
                        [0, 179, 'Other expenses']
                    ]);
                    assertSelectedPoints({
                        0: [5, 6, 7, 8]
                    });
                    assertLassoPoints([
                        [289.8550724637681, 57.97101449275362, 289.8550724637681, 521.7391304347826, 405.7971014492753],
                        ['Net revenue', 'Personnel expenses', 'Operating profit', 'Personnel expenses', 'Material expenses']
                    ]);
                },
                null, LASSOEVENTS, 'waterfall lasso'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'select');
        })
        .then(function() {
            // For some reason we need this to make the following tests pass
            // on CI consistently. It appears that a double-click action
            // is being confused with a mere click. See
            // https://github.com/plotly/plotly.js/pull/2135#discussion_r148897529
            // for more info.
            return new Promise(function(resolve) {
                setTimeout(resolve, 100);
            });
        })
        .then(function() {
            return _run(
                [[300, 300], [400, 400]],
                function() {
                    assertPoints([
                        [0, 281, 'Purchases'],
                        [0, 269, 'Material expenses']
                    ]);
                    assertSelectedPoints({
                        0: [5, 6]
                    });
                    assertRanges([
                        [173.91304347826087, 289.8550724637681],
                        ['Net revenue', 'Personnel expenses']
                    ]);
                },
                null, BOXEVENTS, 'waterfall select'
            );
        })
        .catch(failTest)
        .then(done);
    });

    it('@noCI @flaky should work for funnel traces', function(done) {
        var assertPoints = makeAssertPoints(['curveNumber', 'x', 'y']);
        var assertSelectedPoints = makeAssertSelectedPoints();
        var assertRanges = makeAssertRanges();
        var assertLassoPoints = makeAssertLassoPoints();

        var fig = Lib.extendDeep({}, require('@mocks/funnel_horizontal_group_basic'));
        fig.layout.dragmode = 'lasso';
        addInvisible(fig);

        Plotly.plot(gd, fig)
        .then(function() {
            return _run(
                [[400, 300], [200, 400], [400, 500], [600, 400], [500, 350]],
                function() {
                    assertPoints([
                        [0, 331.5, 'Author: etpinard'],
                        [1, 15.5, 'Author: etpinard']
                    ]);
                    assertSelectedPoints({
                        0: [2],
                        1: [2]
                    });
                    assertLassoPoints([
                        [-154.56790123456787, -1700.2469, -154.5679, 1391.1111, 618.2716],
                        ['Pull requests', 'Author: etpinard', 'Label: bug', 'Author: etpinard', 'Author: etpinard']
                    ]);
                },
                null, LASSOEVENTS, 'funnel lasso'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'select');
        })
        .then(function() {
            // For some reason we need this to make the following tests pass
            // on CI consistently. It appears that a double-click action
            // is being confused with a mere click. See
            // https://github.com/plotly/plotly.js/pull/2135#discussion_r148897529
            // for more info.
            return new Promise(function(resolve) {
                setTimeout(resolve, 100);
            });
        })
        .then(function() {
            return _run(
                [[300, 300], [500, 500]],
                function() {
                    assertPoints([
                        [0, 331.5, 'Author: etpinard'],
                        [1, 53.5, 'Pull requests'],
                        [1, 15.5, 'Author: etpinard']
                    ]);
                    assertSelectedPoints({
                        0: [2],
                        1: [1, 2]
                    });
                    assertRanges([
                        [-927.4074, 618.2716],
                        ['Pull requests', 'Label: bug']
                    ]);
                },
                null, BOXEVENTS, 'funnel select'
            );
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should work for bar traces', function(done) {
        var assertPoints = makeAssertPoints(['curveNumber', 'x', 'y']);
        var assertSelectedPoints = makeAssertSelectedPoints();
        var assertRanges = makeAssertRanges();
        var assertLassoPoints = makeAssertLassoPoints();

        var fig = Lib.extendDeep({}, require('@mocks/0'));
        fig.layout.dragmode = 'lasso';
        addInvisible(fig);

        Plotly.plot(gd, fig)
        .then(function() {
            return _run(
                [[350, 200], [400, 200], [400, 250], [350, 250], [350, 200]],
                function() {
                    assertPoints([
                        [0, 4.9, 0.371], [0, 5, 0.368], [0, 5.1, 0.356], [0, 5.2, 0.336],
                        [0, 5.3, 0.309], [0, 5.4, 0.275], [0, 5.5, 0.235], [0, 5.6, 0.192],
                        [0, 5.7, 0.145],
                        [1, 5.1, 0.485], [1, 5.2, 0.409], [1, 5.3, 0.327],
                        [1, 5.4, 0.24], [1, 5.5, 0.149], [1, 5.6, 0.059],
                        [2, 4.9, 0.473], [2, 5, 0.368], [2, 5.1, 0.258],
                        [2, 5.2, 0.146], [2, 5.3, 0.036]
                    ]);
                    assertSelectedPoints({
                        0: [49, 50, 51, 52, 53, 54, 55, 56, 57],
                        1: [51, 52, 53, 54, 55, 56],
                        2: [49, 50, 51, 52, 53]
                    });
                    assertLassoPoints([
                        [4.87, 5.74, 5.74, 4.87, 4.87],
                        [0.53, 0.53, -0.02, -0.02, 0.53]
                    ]);
                },
                null, LASSOEVENTS, 'bar lasso'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'select');
        })
        .then(delay(100))
        .then(function() {
            return _run(
                [[350, 200], [370, 220]],
                function() {
                    assertPoints([
                        [0, 4.9, 0.371], [0, 5, 0.368], [0, 5.1, 0.356], [0, 5.2, 0.336],
                        [1, 5.1, 0.485], [1, 5.2, 0.41],
                        [2, 4.9, 0.473], [2, 5, 0.37]
                    ]);
                    assertSelectedPoints({
                        0: [49, 50, 51, 52],
                        1: [51, 52],
                        2: [49, 50]
                    });
                    assertRanges([[4.87, 5.22], [0.31, 0.53]]);
                },
                null, BOXEVENTS, 'bar select'
            );
        })
        .then(function() {
            // mimic https://github.com/plotly/plotly.js/issues/3795
            return Plotly.relayout(gd, {
                'xaxis.rangeslider.visible': true,
                'xaxis.range': [0, 6]
            });
        })
        .then(function() {
            return _run(
                [[350, 200], [360, 200]],
                function() {
                    assertPoints([
                        [0, 2.5, -0.429], [1, 2.5, -1.015], [2, 2.5, -1.172],
                    ]);
                    assertSelectedPoints({
                        0: [25],
                        1: [25],
                        2: [25]
                    });
                    assertRanges([[2.434, 2.521], [-1.4355, 2.0555]]);
                },
                null, BOXEVENTS, 'bar select (after xaxis.range relayout)'
            );
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should work for date/category traces', function(done) {
        var assertPoints = makeAssertPoints(['curveNumber', 'x', 'y']);
        var assertSelectedPoints = makeAssertSelectedPoints();

        var fig = {
            data: [{
                x: ['2017-01-01', '2017-02-01', '2017-03-01'],
                y: ['a', 'b', 'c']
            }, {
                type: 'bar',
                x: ['2017-01-01', '2017-02-02', '2017-03-01'],
                y: ['a', 'b', 'c']
            }],
            layout: {
                dragmode: 'lasso',
                width: 400,
                height: 400
            }
        };
        addInvisible(fig);

        var x0 = 100;
        var y0 = 100;
        var x1 = 250;
        var y1 = 250;

        Plotly.plot(gd, fig)
        .then(function() {
            return _run(
                [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]],
                function() {
                    assertPoints([
                        [0, '2017-02-01', 'b'],
                        [1, '2017-02-02', 'b']
                    ]);
                    assertSelectedPoints({0: [1], 1: [1]});
                },
                null, LASSOEVENTS, 'date/category lasso'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'select');
        })
        .then(function() {
            return _run(
                [[x0, y0], [x1, y1]],
                function() {
                    assertPoints([
                        [0, '2017-02-01', 'b'],
                        [1, '2017-02-02', 'b']
                    ]);
                    assertSelectedPoints({0: [1], 1: [1]});
                },
                null, BOXEVENTS, 'date/category select'
            );
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should work for histogram traces', function(done) {
        var assertPoints = makeAssertPoints(['curveNumber', 'x', 'y', 'pointIndices']);
        var assertSelectedPoints = makeAssertSelectedPoints();
        var assertRanges = makeAssertRanges();
        var assertLassoPoints = makeAssertLassoPoints();

        var fig = Lib.extendDeep({}, require('@mocks/hist_grouped'));
        fig.layout.dragmode = 'lasso';
        fig.layout.width = 600;
        fig.layout.height = 500;
        addInvisible(fig);

        Plotly.plot(gd, fig)
        .then(function() {
            return _run(
                [[200, 200], [400, 200], [400, 350], [200, 350], [200, 200]],
                function() {
                    assertPoints([
                        [0, 1.8, 2, [3, 4]], [1, 2.2, 1, [1]], [1, 3.2, 1, [2]]
                    ]);
                    assertSelectedPoints({0: [3, 4], 1: [1, 2]});
                    assertLassoPoints([
                        [1.66, 3.59, 3.59, 1.66, 1.66],
                        [2.17, 2.17, 0.69, 0.69, 2.17]
                    ]);
                },
                null, LASSOEVENTS, 'histogram lasso'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'select');
        })
        .then(function() {
            return _run(
                [[200, 200], [400, 350]],
                function() {
                    assertPoints([
                        [0, 1.8, 2, [3, 4]], [1, 2.2, 1, [1]], [1, 3.2, 1, [2]]
                    ]);
                    assertSelectedPoints({0: [3, 4], 1: [1, 2]});
                    assertRanges([[1.66, 3.59], [0.69, 2.17]]);
                },
                null, BOXEVENTS, 'histogram select'
            );
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should work for box traces', function(done) {
        var assertPoints = makeAssertPoints(['curveNumber', 'y', 'x']);
        var assertSelectedPoints = makeAssertSelectedPoints();
        var assertRanges = makeAssertRanges();
        var assertLassoPoints = makeAssertLassoPoints();

        var fig = Lib.extendDeep({}, require('@mocks/box_grouped'));
        fig.data.forEach(function(trace) {
            trace.boxpoints = 'all';
        });
        fig.layout.dragmode = 'lasso';
        fig.layout.width = 600;
        fig.layout.height = 500;
        fig.layout.xaxis = {range: [-0.565, 1.5]};
        addInvisible(fig);

        Plotly.plot(gd, fig)
        .then(function() {
            return _run(
                [[200, 200], [400, 200], [400, 350], [200, 350], [200, 200]],
                function() {
                    assertPoints([
                        [0, 0.2, 'day 2'], [0, 0.3, 'day 2'], [0, 0.5, 'day 2'], [0, 0.7, 'day 2'],
                        [1, 0.2, 'day 2'], [1, 0.5, 'day 2'], [1, 0.7, 'day 2'], [1, 0.7, 'day 2'],
                        [2, 0.3, 'day 1'], [2, 0.6, 'day 1'], [2, 0.6, 'day 1']
                    ]);
                    assertSelectedPoints({
                        0: [6, 11, 10, 7],
                        1: [11, 8, 6, 10],
                        2: [1, 4, 5]
                    });
                    assertLassoPoints([
                        ['day 1', 'day 2', 'day 2', 'day 1', 'day 1'],
                        [0.71, 0.71, 0.1875, 0.1875, 0.71]
                    ]);
                },
                null, LASSOEVENTS, 'box lasso'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'select');
        })
        .then(function() {
            return _run(
                [[200, 200], [400, 350]],
                function() {
                    assertPoints([
                        [0, 0.2, 'day 2'], [0, 0.3, 'day 2'], [0, 0.5, 'day 2'], [0, 0.7, 'day 2'],
                        [1, 0.2, 'day 2'], [1, 0.5, 'day 2'], [1, 0.7, 'day 2'], [1, 0.7, 'day 2'],
                        [2, 0.3, 'day 1'], [2, 0.6, 'day 1'], [2, 0.6, 'day 1']
                    ]);
                    assertSelectedPoints({
                        0: [6, 11, 10, 7],
                        1: [11, 8, 6, 10],
                        2: [1, 4, 5]
                    });
                    assertRanges([['day 1', 'day 2'], [0.1875, 0.71]]);
                },
                null, BOXEVENTS, 'box select'
            );
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should work for violin traces', function(done) {
        var assertPoints = makeAssertPoints(['curveNumber', 'y', 'x']);
        var assertSelectedPoints = makeAssertSelectedPoints();
        var assertRanges = makeAssertRanges();
        var assertLassoPoints = makeAssertLassoPoints();

        var fig = Lib.extendDeep({}, require('@mocks/violin_grouped'));
        fig.layout.dragmode = 'lasso';
        fig.layout.width = 600;
        fig.layout.height = 500;
        addInvisible(fig);

        Plotly.plot(gd, fig)
        .then(function() {
            return _run(
                [[200, 200], [400, 200], [400, 350], [200, 350], [200, 200]],
                function() {
                    assertPoints([
                        [0, 0.3, 'day 2'], [0, 0.5, 'day 2'], [0, 0.7, 'day 2'], [0, 0.9, 'day 2'],
                        [1, 0.5, 'day 2'], [1, 0.7, 'day 2'], [1, 0.7, 'day 2'], [1, 0.8, 'day 2'],
                        [1, 0.9, 'day 2'],
                        [2, 0.3, 'day 1'], [2, 0.6, 'day 1'], [2, 0.6, 'day 1'], [2, 0.9, 'day 1']
                    ]);
                    assertSelectedPoints({
                        0: [11, 10, 7, 8],
                        1: [8, 6, 10, 9, 7],
                        2: [1, 4, 5, 3]
                    });
                    assertLassoPoints([
                        ['day 1', 'day 2', 'day 2', 'day 1', 'day 1'],
                        [1.02, 1.02, 0.27, 0.27, 1.02]
                    ]);
                },
                null, LASSOEVENTS, 'violin lasso'
            );
        })
        .then(function() {
            return Plotly.relayout(gd, 'dragmode', 'select');
        })
        .then(function() {
            return _run(
                [[200, 200], [400, 350]],
                function() {
                    assertPoints([
                        [0, 0.3, 'day 2'], [0, 0.5, 'day 2'], [0, 0.7, 'day 2'], [0, 0.9, 'day 2'],
                        [1, 0.5, 'day 2'], [1, 0.7, 'day 2'], [1, 0.7, 'day 2'], [1, 0.8, 'day 2'],
                        [1, 0.9, 'day 2'],
                        [2, 0.3, 'day 1'], [2, 0.6, 'day 1'], [2, 0.6, 'day 1'], [2, 0.9, 'day 1']
                    ]);
                    assertSelectedPoints({
                        0: [11, 10, 7, 8],
                        1: [8, 6, 10, 9, 7],
                        2: [1, 4, 5, 3]
                    });
                    assertRanges([['day 1', 'day 2'], [0.27, 1.02]]);
                },
                null, BOXEVENTS, 'violin select'
            );
        })
        .catch(failTest)
        .then(done);
    });

    ['ohlc', 'candlestick'].forEach(function(type) {
        it('@flaky should work for ' + type + ' traces', function(done) {
            var assertPoints = makeAssertPoints(['curveNumber', 'x', 'open', 'high', 'low', 'close']);
            var assertSelectedPoints = makeAssertSelectedPoints();
            var assertRanges = makeAssertRanges();
            var assertLassoPoints = makeAssertLassoPoints();
            var l0 = 275;
            var lv0 = '2011-01-03 18:00';
            var r0 = 325;
            var rv0 = '2011-01-04 06:00';
            var l1 = 75;
            var lv1 = '2011-01-01 18:00';
            var r1 = 125;
            var rv1 = '2011-01-02 06:00';
            var t = 75;
            var tv = 7.565;
            var b = 225;
            var bv = -1.048;

            function countUnSelectedPaths(selector) {
                var unselected = 0;
                d3.select(gd).selectAll(selector).each(function() {
                    var opacity = this.style.opacity;
                    if(opacity < 1) unselected++;
                });
                return unselected;
            }

            Plotly.newPlot(gd, [{
                type: type,
                x: ['2011-01-02', '2011-01-03', '2011-01-04'],
                open: [1, 2, 3],
                high: [3, 4, 5],
                low: [0, 1, 2],
                close: [0, 3, 2]
            }], {
                width: 400,
                height: 400,
                margin: {l: 50, r: 50, t: 50, b: 50},
                yaxis: {range: [-3, 9]},
                dragmode: 'lasso'
            })
            .then(function() {
                return _run(
                    [[l0, t], [l0, b], [r0, b], [r0, t], [l0, t]],
                    function() {
                        assertPoints([[0, '2011-01-04', 3, 5, 2, 2]]);
                        assertSelectedPoints([[2]]);
                        assertLassoPoints([
                            [lv0, lv0, rv0, rv0, lv0],
                            [tv, bv, bv, tv, tv]
                        ]);
                        expect(countUnSelectedPaths('.cartesianlayer .trace path')).toBe(2);
                        expect(countUnSelectedPaths('.rangeslider-rangeplot .trace path')).toBe(0);
                    },
                    null, LASSOEVENTS, type + ' lasso'
                );
            })
            .then(function() {
                return Plotly.relayout(gd, 'dragmode', 'select');
            })
            .then(function() {
                return _run(
                    [[l1, t], [r1, b]],
                    function() {
                        assertPoints([[0, '2011-01-02', 1, 3, 0, 0]]);
                        assertSelectedPoints([[0]]);
                        assertRanges([[lv1, rv1], [bv, tv]]);
                    },
                    null, BOXEVENTS, type + ' select'
                );
            })
            .catch(failTest)
            .then(done);
        });
    });

    it('@flaky should work on traces with enabled transforms', function(done) {
        var assertSelectedPoints = makeAssertSelectedPoints();

        Plotly.plot(gd, [{
            x: [1, 2, 3, 4, 5],
            y: [2, 3, 1, 7, 9],
            marker: {size: [10, 20, 20, 20, 10]},
            transforms: [{
                type: 'filter',
                operation: '>',
                value: 2,
                target: 'y'
            }, {
                type: 'aggregate',
                groups: 'marker.size',
                aggregations: [
                    // 20: 6, 10: 5
                    {target: 'x', func: 'sum'},
                    // 20: 5, 10: 9
                    {target: 'y', func: 'avg'}
                ]
            }]
        }], {
            dragmode: 'select',
            showlegend: false,
            width: 400,
            height: 400,
            margin: {l: 0, t: 0, r: 0, b: 0}
        })
        .then(function() {
            return _run(
                [[5, 5], [395, 395]],
                function() {
                    assertSelectedPoints({0: [1, 3, 4]});
                },
                [380, 180],
                BOXEVENTS, 'transformed trace select (all points selected)'
            );
        })
        .catch(failTest)
        .then(done);
    });

    it('@flaky should work on scatter/bar traces with text nodes', function(done) {
        var assertSelectedPoints = makeAssertSelectedPoints();

        function assertFillOpacity(exp, msg) {
            var txtPts = d3.select(gd).select('g.plot').selectAll('text');

            expect(txtPts.size()).toBe(exp.length, '# of text nodes: ' + msg);

            txtPts.each(function(_, i) {
                var act = Number(this.style['fill-opacity']);
                expect(act).toBe(exp[i], 'node ' + i + ' fill opacity: ' + msg);
            });
        }

        Plotly.plot(gd, [{
            mode: 'markers+text',
            x: [1, 2, 3],
            y: [1, 2, 1],
            text: ['a', 'b', 'c']
        }, {
            type: 'bar',
            x: [1, 2, 3],
            y: [1, 2, 1],
            text: ['A', 'B', 'C'],
            textposition: 'outside'
        }], {
            dragmode: 'select',
            hovermode: 'closest',
            showlegend: false,
            width: 400,
            height: 400,
            margin: {l: 0, t: 0, r: 0, b: 0}
        })
        .then(function() {
            return _run(
                [[10, 10], [100, 300]],
                function() {
                    assertSelectedPoints({0: [0], 1: [0]});
                    assertFillOpacity([1, 0.2, 0.2, 1, 0.2, 0.2], '_run');
                },
                [10, 10], BOXEVENTS, 'selecting first scatter/bar text nodes'
            );
        })
        .then(function() {
            assertFillOpacity([1, 1, 1, 1, 1, 1], 'final');
        })
        .catch(failTest)
        .then(done);
    });

    describe('should work on sankey traces', function() {
        var waitingTime = sankeyConstants.duration * 2;

        it('@flaky select', function(done) {
            var fig = Lib.extendDeep({}, require('@mocks/sankey_circular.json'));
            fig.layout.dragmode = 'select';
            var dblClickPos = [250, 400];

            Plotly.plot(gd, fig)
            .then(function() {
                // No groups initially
                expect(gd._fullData[0].node.groups).toEqual([]);
            })
            .then(function() {
                // Grouping the two nodes on the top right
                return _run(
                    [[640, 130], [400, 450]],
                    function() {
                        expect(gd._fullData[0].node.groups).toEqual([[2, 3]], 'failed to group #2 + #3');
                    },
                    dblClickPos, BOXEVENTS, 'for top right nodes #2 and #3'
                );
            })
            .then(delay(waitingTime))
            .then(function() {
                // Grouping node #4 and the previous group
                drag([[715, 400], [300, 110]]);
            })
            .then(delay(waitingTime))
            .then(function() {
                expect(gd._fullData[0].node.groups).toEqual([[4, 3, 2]], 'failed to group #4 + existing group of #2 and #3');
            })
            .catch(failTest)
            .then(done);
        });

        it('@flaky should not work when dragmode is undefined', function(done) {
            var fig = Lib.extendDeep({}, require('@mocks/sankey_circular.json'));
            fig.layout.dragmode = undefined;

            Plotly.plot(gd, fig)
            .then(function() {
                // No groups initially
                expect(gd._fullData[0].node.groups).toEqual([]);
            })
            .then(function() {
                // Grouping the two nodes on the top right
                drag([[640, 130], [400, 450]]);
            })
            .then(delay(waitingTime))
            .then(function() {
                expect(gd._fullData[0].node.groups).toEqual([]);
            })
            .catch(failTest)
            .then(done);
        });
    });
});

describe('Test that selections persist:', function() {
    var gd;

    beforeEach(function() {
        gd = createGraphDiv();
    });

    afterEach(destroyGraphDiv);

    function assertPtOpacity(selector, expected) {
        d3.selectAll(selector).each(function(_, i) {
            var style = Number(this.style.opacity);
            expect(style).toBe(expected.style[i], 'style for pt ' + i);
        });
    }

    it('should persist for scatter', function(done) {
        function _assert(expected) {
            var selected = gd.calcdata[0].map(function(d) { return d.selected; });
            expect(selected).toBeCloseToArray(expected.selected, 'selected vals');
            assertPtOpacity('.point', expected);
        }

        Plotly.plot(gd, [{
            x: [1, 2, 3],
            y: [1, 2, 1]
        }], {
            dragmode: 'select',
            width: 400,
            height: 400,
            margin: {l: 0, t: 0, r: 0, b: 0}
        })
        .then(function() {
            resetEvents(gd);
            drag([[5, 5], [250, 350]]);
            return selectedPromise;
        })
        .then(function() {
            _assert({
                selected: [0, 1, 0],
                style: [0.2, 1, 0.2]
            });

            // trigger a recalc
            Plotly.restyle(gd, 'x', [[10, 20, 30]]);
        })
        .then(function() {
            _assert({
                selected: [undefined, 1, undefined],
                style: [0.2, 1, 0.2]
            });
        })
        .catch(failTest)
        .then(done);
    });

    it('should persist for box', function(done) {
        function _assert(expected) {
            var selected = gd.calcdata[0][0].pts.map(function(d) { return d.selected; });
            expect(selected).toBeCloseToArray(expected.cd, 'selected calcdata vals');
            expect(gd.data[0].selectedpoints).toBeCloseToArray(expected.selectedpoints, 'selectedpoints array');
            assertPtOpacity('.point', expected);
        }

        Plotly.plot(gd, [{
            type: 'box',
            x0: 0,
            y: [5, 4, 4, 1, 2, 2, 2, 2, 2, 3, 3, 3],
            boxpoints: 'all'
        }], {
            dragmode: 'select',
            width: 400,
            height: 400,
            margin: {l: 0, t: 0, r: 0, b: 0}
        })
        .then(function() {
            resetEvents(gd);
            drag([[5, 5], [400, 150]]);
            return selectedPromise;
        })
        .then(function() {
            _assert({
                // N.B. pts in calcdata are sorted
                cd: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
                selectedpoints: [1, 2, 0],
                style: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 1, 1, 1],
            });

            // trigger a recalc
            Plotly.restyle(gd, 'x0', 1);
        })
        .then(function() {
            _assert({
                cd: [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 1, 1],
                selectedpoints: [1, 2, 0],
                style: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 1, 1, 1],
            });
        })
        .catch(failTest)
        .then(done);
    });

    it('should persist for histogram', function(done) {
        function _assert(expected) {
            var selected = gd.calcdata[0].map(function(d) { return d.selected; });
            expect(selected).toBeCloseToArray(expected.selected, 'selected vals');
            assertPtOpacity('.point > path', expected);
        }

        Plotly.plot(gd, [{
            type: 'histogram',
            x: [1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5],
            boxpoints: 'all'
        }], {
            dragmode: 'select',
            width: 400,
            height: 400,
            margin: {l: 0, t: 0, r: 0, b: 0}
        })
        .then(function() {
            resetEvents(gd);
            drag([[5, 5], [400, 150]]);
            return selectedPromise;
        })
        .then(function() {
            _assert({
                selected: [0, 1, 0, 0, 0],
                style: [0.2, 1, 0.2, 0.2, 0.2],
            });

            // trigger a recalc
            Plotly.restyle(gd, 'histfunc', 'sum');
        })
        .then(done)
        .then(function() {
            _assert({
                selected: [undefined, 1, undefined, undefined, undefined],
                style: [0.2, 1, 0.2, 0.2, 0.2],
            });
        })
        .catch(failTest)
        .then(done);
    });
});

// to make sure none of the above tests fail with extraneous invisible traces,
// add a bunch of them here
function addInvisible(fig, canHaveLegend) {
    var data = fig.data;
    var inputData = Lib.extendDeep([], data);
    for(var i = 0; i < inputData.length; i++) {
        data.push(Lib.extendDeep({}, inputData[i], {visible: false}));
        if(canHaveLegend !== false) data.push(Lib.extendDeep({}, inputData[i], {visible: 'legendonly'}));
    }

    if(inputData.length === 1 && fig.layout.showlegend !== true) fig.layout.showlegend = false;
}
