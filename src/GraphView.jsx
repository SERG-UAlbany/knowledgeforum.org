import React, {Component} from 'react'
import { connect } from 'react-redux'
import Cytoscape from 'cytoscape';
import CytoscapeComponent from 'react-cytoscapejs';
import CytoscapePanZoom from 'cytoscape-panzoom';
import CytoscapeNodeHtmlLabel from 'cytoscape-node-html-label';
import CytoscapeSupportImages from 'cytoscape-supportimages';

import { updateViewLink } from './store/async_actions.js'
import {addNodesToGraph, addEdgesToGraph} from './helper/Graph_helper.js';
import './css/cytoscape.js-panzoom.css';
import './css/Graph.css';

import unread_note_icon from './assets/icon_note_blue.png';
import read_note_icon from './assets/icon_note_red.png';
import unread_riseabove_icon from './assets/icon_riseabove_blue.png';
import read_riseabove_icon from './assets/icon_riseabove_red.png';
import attachment_icon from './assets/icon_attachment.gif';
import view_icon from './assets/icon_view.png';

import {MINZOOM, MAXZOOM} from './config.js';

Cytoscape.use(CytoscapePanZoom);
Cytoscape.use(CytoscapeNodeHtmlLabel);
Cytoscape.use(CytoscapeSupportImages);

class GraphView extends Component {
  constructor(props) {
    super(props);

    this.state = {
      elements: {nodes: [], edges: []},
      kfToCyMap: null,
      removedSearchElements: null,
      removedEdgeElements: null,
      currViewLinksLength: 0
    };

    this.loadElements = this.loadElements.bind(this);
    this.supportImageIsDuplicate = this.supportImageIsDuplicate.bind(this);
    this.compareSupportImages = this.compareSupportImages.bind(this);
    this.findCyIdsFromKfId = this.findCyIdsFromKfId.bind(this);
    this.updateReadLinks = this.updateReadLinks.bind(this);
    this.focusRecentAddition = this.focusRecentAddition.bind(this);
    this.filterNodes = this.filterNodes.bind(this);
    this.getViewSettingsInfo = this.getViewSettingsInfo.bind(this);
    this.updateViewSettings = this.updateViewSettings.bind(this);
  };

  loadElements(prevViewLinksLength, forceRender) {
      // ensure we have all the informationn needed to render the graph
      // if ((VIEWLINKS UPDATED OR FORCE RENDER FROM EDGE CASE) AND WE HAVE BUILDSON + AUTHORS INFO)
      // only the viewlinks prop changes between views - buildson and author info stays the same
      if ((this.props.viewLinks.length !== this.state.currViewLinksLength || forceRender) && this.props.buildsOn.length !== 0 && Object.keys(this.props.authors).length !== 0){
          this.setState({currViewLinksLength: this.props.viewLinks.length});
          const cy = this.cy;
          const si = cy.supportimages();

          // we keep a map with (key, value) of (kfId, count) in order to create duplicate notes with unique ids
          // simply append the count to the end of their note id
          var nodes = new Map();

          // clear the support images extension
          si._private.supportImages = [];

          var viewSettingInfo = this.getViewSettingsInfo();

          var graph_nodes = addNodesToGraph(this.props.server, this.props.token, nodes, this.props.viewLinks, this.props.authors, viewSettingInfo);
          var graph_edges = viewSettingInfo.buildson ? addEdgesToGraph(nodes, this.props.buildsOn) : [];
          var self = this;

          Promise.all(graph_nodes.concat(graph_edges)).then((graph_results) => {
              var cy_elements = {nodes: [], edges: []};
              for(let i = 0; i < graph_results.length; i++){
                  if(graph_results[i].group === "nodes"){
                      cy_elements.nodes.push(graph_results[i]);
                  } else if(graph_results[i].group === "edges"){
                      cy_elements.edges.push(graph_results[i]);
                  } else if(graph_results[i].url && !this.supportImageIsDuplicate(si.images(), graph_results[i])){
                      si.addSupportImage(graph_results[i]);
                  }
              }

              self.setState({elements: cy_elements});
              self.setState({kfToCyMap: nodes});
              // support-images extension will not trigger a redraw if there are no images in the view - this line handles that
              if(si.images().length === 0){ si._private.renderer.redraw(); }
              // if a single new element was added to the graph - highlight it
              if(this.props.viewLinks.length === prevViewLinksLength + 1){ this.focusRecentAddition(this.props.viewLinks[this.props.viewLinks.length - 1]); }
              this.updateReadLinks();
          });
      }
  }

  // checks if the given image a is already present in the list of support images
  supportImageIsDuplicate(imgs, a){
    for(var i in imgs){
      if(this.compareSupportImages(imgs[i], a)) return true;
    }
    return false;
  }

  // returns a deep comparison of two support images
  compareSupportImages(a, b){
    return a.bounds.height === b.bounds.height && a.bounds.width === b.bounds.width && a.bounds.x === b.bounds.x && a.bounds.y === b.bounds.y
        && a.name === b.name && a.url === b.url;
  }

  // returns an array of cytoscapeIds corresponding to the given kfId
  findCyIdsFromKfId(kfId){
    var map = this.state.kfToCyMap;
    if(map.has(kfId)){
      var cytoscapeIds = [];
      var countInstances = map.get(kfId);
      for(let i = 1; i <= countInstances; i++){
        cytoscapeIds.push(kfId+'-'+i);
      }
      return cytoscapeIds;
    }
    return null;
  }

  // all links are initially marked as unread - this function updates the read links accordingly afterward
  updateReadLinks(){
    var cy = this.cy;
    var readLinks = this.props.readLinks;
    var self = this;

    // cy.batch() updates all the elements one time instead of triggering multiple redraws
    cy.batch(function(){

      for(let i in readLinks){
        var cy_elems = self.findCyIdsFromKfId(readLinks[i]); // the element will either be a riseabove or a regular note
        if(cy_elems !== null && cy_elems.length !== 0){
          var isRiseAbove = cy.$('#'+cy_elems[0]).hasClass('unread-riseabove') ? true : false;
          var classToRemove = isRiseAbove ? 'unread-riseabove' : 'unread-note';
          var classToAdd = isRiseAbove ? 'read-riseabove' : 'read-note';
          for(let i in cy_elems){
            cy.$('#'+cy_elems[i]).removeClass(classToRemove).addClass(classToAdd);
          }
        }
      }

    });
  }

  focusRecentAddition(note){
    var cy = this.cy;
    var kfId = note.to;
    var cyIds = this.findCyIdsFromKfId(kfId);
    if(cyIds !== null){
      var newestCyElem = cy.$('#'+cyIds[cyIds.length - 1]);
      cy.center(newestCyElem);
      newestCyElem.flashClass('recentAddition', 10000);
    }
  }

  filterNodes(q){
    var cy = this.cy;
    const si = cy.supportimages();

    if(this.state.removedSearchElements !== null) this.state.removedSearchElements.restore();
    this.setState({removedSearchElements: null});
    var imgs = si.images();
    for(let i in imgs){
      si.setImageVisible(imgs[i], true);
    }

    var nodesToHide = cy.collection();
    const query = q || this.props.searchQuery;
    const notes = Object.values(this.props.viewNotes);
    var filter = this.props.searchFilter;
    var self = this;
    switch (filter) {
        case "title":
            // eslint-disable-next-line
            nodesToHide = cy.filter(function(elem, i){
               const elem_type = elem.data('type');
               const elem_title = elem.data('name');
               if((elem_type === "note" || elem_type === "View" || elem_type === "riseabove" || elem_type === "Attachment") && !elem_title.toLowerCase().includes(query.toLowerCase())){
                 return elem;
               }
            });

            // for(let i in imgs){
            //   var supportImg = imgs[i];
            //   if(!supportImg.name.toLowerCase().includes(query.toLowerCase())){
            //     si.setImageVisible(supportImg, false);
            //   }
            // }

            break;

        case "content":
            // eslint-disable-next-line
            notes.filter(function (obj) {
                if (obj.data && ( (obj.data.English && !obj.data.English.includes(query)) || (obj.data.body && !obj.data.body.includes(query)) ) ) {
                  var cy_ids = self.findCyIdsFromKfId(obj._id);
                  for(let j in cy_ids){ nodesToHide = nodesToHide.union(cy.$('#'+cy_ids[j])); }
                }
            });

            break;

        case "author":
            // eslint-disable-next-line
            nodesToHide = cy.filter(function(elem, i){
               const elem_type = elem.data('type');
               const elem_author = elem.data('author');
               if((elem_type === "note" || elem_type === "View" || elem_type === "riseabove" || elem_type === "Attachment") && !elem_author.toLowerCase().includes(query.toLowerCase())){
                 return elem;
               }
            });

            // for(let i in imgs){
            //   var supportImg = imgs[i];
            //   if(!supportImg.author.toLowerCase().includes(query.toLowerCase())){
            //     si.setImageVisible(supportImg, false);
            //   }
            // }

            break;

        case "scaffold":
            const noteIds = this.props.supports.filter(support => support.from === query).map(support => support.to);
            // eslint-disable-next-line
            notes.filter(function(note){
              if(!noteIds.includes(note._id)){
                var cy_ids = self.findCyIdsFromKfId(note._id);
                for(let j in cy_ids){ nodesToHide = nodesToHide.union(cy.$('#'+cy_ids[j])); }
              }
            });
            break;

        default:
            break;
    }

    if(nodesToHide.length !== 0){
      var removedSearchElements = cy.remove(nodesToHide);
      this.setState({removedSearchElements: removedSearchElements});
    }
  }

  // formats the view settings to be used in cytoscape
  getViewSettingsInfo(){
    var viewSettings = this.props.viewSettings;
    var result = {};
    if(viewSettings.showAuthor && viewSettings.showTime){ result.nodeClass = 'nodehtmllabel-author-date'; }
    else if(viewSettings.showAuthor && !viewSettings.showTime) { result.nodeClass = 'nodehtmllabel-author-nodate'; }
    else if(!viewSettings.showAuthor && viewSettings.showTime) { result.nodeClass = 'nodehtmllabel-noauthor-date'; }
    else if(!viewSettings.showAuthor && !viewSettings.showTime) { result.nodeClass = 'nodehtmllabel-noauthor-nodate'; }

    result.buildson = viewSettings.buildson;
    result.references = viewSettings.references;
    return result;
  }

  // batch updates the nodes and edges corresponding to the view settings
  updateViewSettings(){
    var cy = this.cy;

    if(this.state.removedEdgeElements !== null) this.state.removedEdgeElements.restore();
    this.setState({removedEdgeElements: null});

    var nodes = cy.nodes();
    var edges = cy.edges();
    var newInfo = this.getViewSettingsInfo();
    var self = this;
    cy.batch(function(){

      if(nodes.length !== 0){
        // iterate cytoscape nodes
        for(let i in nodes){
          if(nodes[i][0] && nodes[i][0].classes()){

            // iterate the nodes classes to see if it has a class with prefix 'nodehtmllabel'
            // if it does replace it with the nodeClass in the newInfo object
            var classes = nodes[i][0].classes();
            for(let j in classes){
              if(classes[j].substring(0,13) === 'nodehtmllabel'){
                nodes[i].removeClass(classes[j]).addClass(newInfo.nodeClass);
              }
            }
          }
        }
      }

      if(edges.length !== 0){
        // iterate cytoscape edges
        var edgesToHide = cy.collection();
        for(let i in edges){
          // if the edge is a buildson and buildson are hidden OR if the edge is a reference and references are hidden - add it to the collection of edges to be removed
          if(edges[i][0] && ((edges[i][0].hasClass('buildson') && newInfo.buildson === false) || ((edges[i][0].hasClass('reference') && newInfo.references === false)))){
            edgesToHide = edgesToHide.union(edges[i][0]);
          }
        }
        
        if(edgesToHide.length !== 0){
          var removedEdgeElements = cy.remove(edgesToHide);
          self.setState({removedEdgeElements: removedEdgeElements});
        }
      }
    });

  }

  componentDidMount() {
    var cy = this.cy;

    // CYTOSCAPE-PANZOOM EXTENSION
    // the default values of each option are outlined below:
    var defaults = {
      zoomFactor: 0.05, // zoom factor per zoom tick
      zoomDelay: 45, // how many ms between zoom ticks
      minZoom: MINZOOM, // min zoom level
      maxZoom: MAXZOOM, // max zoom level
      fitPadding: 50, // padding when fitting
      panSpeed: 10, // how many ms in between pan ticks
      panDistance: 10, // max pan distance per tick
      panDragAreaSize: 75, // the length of the pan drag box in which the vector for panning is calculated (bigger = finer control of pan speed and direction)
      panMinPercentSpeed: 0.25, // the slowest speed we can pan by (as a percent of panSpeed)
      panInactiveArea: 8, // radius of inactive area in pan drag box
      panIndicatorMinOpacity: 0.5, // min opacity of pan indicator (the draggable nib); scales from this to 1.0
      zoomOnly: false, // a minimal version of the ui only with zooming (useful on systems with bad mousewheel resolution)
      fitSelector: undefined, // selector of elements to fit
      animateOnFit: function(){ // whether to animate on fit
        return false;
      },
      fitAnimationDuration: 1000, // duration of animation on fit

      // icon class names
      sliderHandleIcon: 'fa fa-minus',
      zoomInIcon: 'fa fa-plus',
      zoomOutIcon: 'fa fa-minus',
      resetIcon: 'fa fa-expand'
    };

    // add the panzoom control
    cy.panzoom( defaults );

    // CYTOSCAPE-NODE-HTML-LABEL EXTENSION
    cy.nodeHtmlLabel([
      {
        query: '.nodehtmllabel-author-date',
        halign: 'center', // title horizontal position. Can be 'left',''center, 'right'
        valign: 'bottom', // title vertical position. Can be 'top',''center, 'bottom'
        halignBox: 'right', // title relative box horizontal position. Can be 'left',''center, 'right'
        valignBox: 'bottom', // title relative box vertical position. Can be 'top',''center, 'bottom'
        cssClass: 'cytoscape-label', // any classes will be as attribute of <div> container for every title
        tpl: function(data){
          // we only want author and creation date listed for notes
          if(data.type === 'note' || data.type === 'riseabove' || data.type === 'Attachment'){
            return '<div>' + data.author + '<br>' + data.date + '</div>';
          } else {
            return '';
          }
        }
      },
      {
        query: '.nodehtmllabel-author-nodate',
        halign: 'center', // title horizontal position. Can be 'left',''center, 'right'
        valign: 'bottom', // title vertical position. Can be 'top',''center, 'bottom'
        halignBox: 'right', // title relative box horizontal position. Can be 'left',''center, 'right'
        valignBox: 'bottom', // title relative box vertical position. Can be 'top',''center, 'bottom'
        cssClass: 'cytoscape-label', // any classes will be as attribute of <div> container for every title
        tpl: function(data){
          // we only want author and creation date listed for notes
          if(data.type === 'note' || data.type === 'riseabove' || data.type === 'Attachment'){
            return '<div>' + data.author + '</div>';
          } else {
            return '';
          }
        }
      },
      {
        query: '.nodehtmllabel-noauthor-date',
        halign: 'center', // title horizontal position. Can be 'left',''center, 'right'
        valign: 'bottom', // title vertical position. Can be 'top',''center, 'bottom'
        halignBox: 'right', // title relative box horizontal position. Can be 'left',''center, 'right'
        valignBox: 'bottom', // title relative box vertical position. Can be 'top',''center, 'bottom'
        cssClass: 'cytoscape-label', // any classes will be as attribute of <div> container for every title
        tpl: function(data){
          // we only want author and creation date listed for notes
          if(data.type === 'note' || data.type === 'riseabove' || data.type === 'Attachment'){
            return '<div>' + data.date + '</div>';
          } else {
            return '';
          }
        }
      },
      {
        query: '.nodehtmllabel-noauthor-nodate',
        halign: 'center', // title horizontal position. Can be 'left',''center, 'right'
        valign: 'bottom', // title vertical position. Can be 'top',''center, 'bottom'
        halignBox: 'right', // title relative box horizontal position. Can be 'left',''center, 'right'
        valignBox: 'bottom', // title relative box vertical position. Can be 'top',''center, 'bottom'
        cssClass: 'cytoscape-label', // any classes will be as attribute of <div> container for every title
        tpl: function(data){
            return '';
        }
      },
    ]);

    this.loadElements();

    var ref = this;
    // on single click of node log its kf id and mark it as read
    cy.on('tap', 'node', function(event){
      var kfId = this.data('kfId');
      var type = this.data('type');

      if(this.hasClass("image")){
        console.log("image");
      } else if(this.hasClass("attachment")){
        console.log("attachment");
          ref.props.onNoteClick(kfId)
      } else if(this.hasClass("view")){
          ref.props.onViewClick(kfId);
      } else {
        if(type === "riseabove"){
            this.removeClass("unread-riseabove");
            this.addClass("read-riseabove");
        } else if(type === "note"){
            ref.props.onNoteClick(kfId)
            this.removeClass("unread-note");
            this.addClass("read-note");
        }
      }
    });

      cy.on('dragfree', 'node', (evt) => {
          const {x, y} = evt.target.position();

          var kfId = evt.target.data().kfId;

          let viewLink = this.props.viewLinks.filter((link) => link.to === kfId)
          if (viewLink.length) {
              viewLink = viewLink[0];
              const data = {x, y}
              const newViewLink = { ...viewLink }
              newViewLink.data = { ...newViewLink.data, ...data };
              this.props.updateViewLink(newViewLink)
          }
      })

      //Update view link of image if position is changed
      cy.on('cysupportimages.imagemoved', (evt, img) => {
          let viewLink = this.props.viewLinks.filter((link) => link._id === img.linkId)
          if (viewLink.length) {
              viewLink = viewLink[0];
              const data = {x: img.bounds.x, y: img.bounds.y}
              const newViewLink = { ...viewLink }
              newViewLink.data = { ...newViewLink.data, ...data };
              this.props.updateViewLink(newViewLink)
          }
      })

      cy.on('cysupportimages.imageresized', (evt, img, b1, b2) => {
          let viewLink = this.props.viewLinks.filter((link) => link._id === img.linkId)
          if (viewLink.length) {
              viewLink = viewLink[0];
              const data = {width: img.bounds.width, height: img.bounds.height}
              const newViewLink = { ...viewLink }
              newViewLink.data = { ...newViewLink.data, ...data };
              this.props.updateViewLink(newViewLink)
          }
      })
  }

  componentDidUpdate(prevProps, prevState) {
      // AN OBJECT MAPPING DIFFERENT RENDERING CASES TO BOOLEAN VALUES
      // this is an attempt to organize and account for all the edge cases when deciding to rerender the graph
      let cases = {
        anyPropUpdated: (this.props.viewId !== prevProps.viewId || this.props.buildsOn !== prevProps.buildsOn
                            || this.props.authors !== prevProps.authors || this.props.viewLinks !== prevProps.viewLinks || this.props.readLinks !== prevProps.readLinks),

        nodePositionUpdated: (this.props.viewId === prevProps.viewId && this.props.buildsOn === prevProps.buildsOn && this.props.authors === prevProps.authors
                            && this.props.viewLinks !== prevProps.viewLinks && this.props.viewLinks.length === prevProps.viewLinks.length && this.props.readLinks === prevProps.readLinks),

        switchedToEmptyView: (this.props.viewId !== prevProps.viewId && this.props.buildsOn === prevProps.buildsOn && this.props.authors === prevProps.authors
                            && this.props.viewLinks !== prevProps.viewLinks && this.props.viewLinks.length === 0 && prevProps.viewLinks.length !== undefined),

        searchTriggered: (this.props.searchQuery !== prevProps.searchQuery || this.props.searchFilter !== prevProps.searchFilter),

        viewSettingsChanged: (this.props.viewSettings !== prevProps.viewSettings),
      }

      var forceRender = (cases.nodePositionUpdated || cases.switchedToEmptyView);

      if(cases.searchTriggered){ this.filterNodes(); }
      if(cases.viewSettingsChanged){ this.updateViewSettings(); }
      if(cases.anyPropUpdated){ this.loadElements(prevProps.viewLinks.length, forceRender); }
  }

  render() {
    return(
          <CytoscapeComponent
          cy={(cy) => { this.cy = cy }}
          style={ { width: '100%', height: '100%' } }
          elements={CytoscapeComponent.normalizeElements(this.state.elements)}
          stylesheet={ [
            {
              selector: 'node',
              style: {
                'label': "data(name)",
                'font-size': '11px',
                'text-halign': 'right',
                'text-valign': 'center',
                'text-margin-x': '-5',
                'padding': '0',
                'background-opacity': '0',
                'background-clip': 'none',
                'background-width': '15px',
                'background-height': '15px',
              }
            },
            {
              selector: 'edge',
              style: {
                'width': 1,
                'line-color': '#29648f',
                'target-arrow-color': '#29648f',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier'
              }
            },

            {selector: '.unread-note', style: {'background-image': [unread_note_icon]}},
            {selector: '.read-note', style: {'background-image': [read_note_icon]}},
            {selector: '.unread-riseabove', style: {'background-image': [unread_riseabove_icon]}},
            {selector: '.read-riseabove', style: {'background-image': [read_riseabove_icon]}},
            {selector: '.attachment', style: {'background-image': [attachment_icon]}},
            {selector: '.view', style: {'background-image': [view_icon]}},
            {selector: '.image', style: {'label': ''}},
            {selector: '.drawing', style: {'label': ''}},
            {
              selector: '.recentAddition',
              style: {
                'border-style': 'solid',
                'border-width': '2',
                'border-color': 'red',
              }
            },
          ] }
          layout={ {name: 'grid'} }
          hideEdgesonViewport={ false }
          autolock={ false }
          wheelSensitivity={ 0.15 }
          minZoom={ MINZOOM }
          maxZoom={ MAXZOOM }
          />
          );
  }
}

const mapStateToProps = (state, ownProps) => {
    return {
        token: state.globals.token,
        server: state.globals.currentServer,
        viewId: state.globals.viewId,
        view: state.globals.view,
        author: state.globals.author,
        authors: state.users,
        viewNotes: state.notes.viewNotes,
        viewLinks: state.notes.viewLinks,
        readLinks: state.notes.readLinks,
        buildsOn: state.notes.buildsOn,
        supports: state.notes.supports,
        searchQuery: state.globals.searchQuery,
        searchFilter: state.globals.searchFilter,
    }
}

const mapDispatchToProps = {
    updateViewLink
}

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(GraphView)
