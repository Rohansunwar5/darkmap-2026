import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { motion, AnimatePresence } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faExpandArrowsAlt, faProjectDiagram } from '@fortawesome/free-solid-svg-icons';
import { getImage, isImageReady, requestImage, buildProfilePfpUrl } from './imageLoader';

const NodeVisualizer = ({ isOpen, onClose, data }) => {
  const fgRef = useRef();
  const containerRef = useRef();
  const hoverNodeRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Fix container blank space: precisely track the flex container dimensions
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [isOpen]);

  const graphData = useMemo(() => {
    if (!data?.telegram?.result?.user || !isOpen) return { nodes: [], links: [] };

    const user = data.telegram.result.user;
    const groups = data.telegram.result.groups || [];

    const nodes = [
      {
        id: 'user-root',
        name: `@${user.username || user.id}`,
        username: user.username || null,
        val: 40,
        color: '#00D1FF',
        type: 'user',
        isRoot: true,
        x: 0,
        y: 0,
        fx: 0,
        fy: 0
      },
      ...groups.map((g, i) => {
        // Strict 2-Ring Physics Layout using fx/fy to prevent physics from blending the rings
        const isInnerRing = i < 18;
        const nodesInRing = isInnerRing ? Math.min(18, groups.length) : (groups.length - 18);
        const indexInRing = isInnerRing ? i : (i - 18);
        const angle = (indexInRing / nodesInRing) * 2 * Math.PI;
        
        // Massive mathematical distance between rings to compensate for fixed-size cards
        const radiusX = isInnerRing ? 550 : 1300;
        const radiusY = isInnerRing ? 550 : 900;

        return {
          id: `group-${g.id}-${i}`,
          name: g.title,
          username: g.username || null,
          val: 15,
          color: '#126382',
          type: 'group',
          x: Math.cos(angle) * radiusX,
          y: Math.sin(angle) * radiusY,
          fx: Math.cos(angle) * radiusX,
          fy: Math.sin(angle) * radiusY
        };
      })
    ];

    const links = groups.map((g, i) => ({
      source: 'user-root',
      target: `group-${g.id}-${i}`,
      color: '#126382'
    }));

    return { nodes, links };
  }, [data, isOpen]);

  // Lock physics so the strict 2-ring distance is maintained perfectly
  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge', null);
      fgRef.current.d3Force('link', null);
      fgRef.current.d3Force('center', null);
    }
  }, [graphData]);

  // Center and fit the graph automatically when it opens
  useEffect(() => {
    if (isOpen && fgRef.current && dimensions.width > 0 && graphData.nodes.length > 0) {
      // Use double-timeouts to guarantee zoomToFit fires after the canvas is fully mounted
      const timer1 = setTimeout(() => fgRef.current.zoomToFit(400, 50), 100);
      const timer2 = setTimeout(() => fgRef.current.zoomToFit(400, 50), 600);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [isOpen, graphData, dimensions.width]);

  const getNodeDimensions = (node, ctx, globalScale) => {
    const isHovered = hoverNodeRef.current === node;
    const fontSize = node.isRoot ? 11 / globalScale : 8 / globalScale;
    ctx.font = `${fontSize}px Aldrich`;
    
    let label = node.name;
    const words = label.split(' ');
    
    // Always calculate height based on max 2 lines to keep it static
    let staticLines = [];
    let currentLine = [];
    words.forEach(word => {
      currentLine.push(word);
      if (currentLine.length >= 2) {
        staticLines.push(currentLine.join(' '));
        currentLine = [];
      }
    });
    if (currentLine.length > 0) staticLines.push(currentLine.join(' '));
    
    let displayLines = [];
    if (isHovered) {
      displayLines = [label]; // Expand horizontally into one line
    } else {
      if (staticLines.length > 2) {
        displayLines = staticLines.slice(0, 2);
        displayLines[1] = displayLines[1] + ' ...';
      } else {
        displayLines = staticLines;
      }
    }

    const lineHeight = fontSize * 1.3;
    
    let maxLineWidth = 0;
    displayLines.forEach(line => {
      const width = ctx.measureText(line).width;
      if (width > maxLineWidth) maxLineWidth = width;
    });

    const padding = 10 / globalScale;
    const imgSize = (node.isRoot ? 48 : 36) / globalScale; 
    const spacing = 6 / globalScale;
    
    const minWidth = imgSize + padding * 2;
    const w = Math.max(minWidth, maxLineWidth + padding * 2);
    
    // Height is STRICTLY based on the static unhovered state
    const effectiveStaticLines = Math.min(2, staticLines.length);
    const textHeight = effectiveStaticLines * lineHeight;
    const h = imgSize + spacing + textHeight + padding * 2;
    
    const x = node.x - w / 2;
    const y = node.y - h / 2;

    return { w, h, x, y, lines: displayLines, padding, imgSize, spacing, lineHeight, fontSize };
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[6000] bg-[rgba(0,8,15,0.98)] backdrop-blur-2xl flex flex-col font-[Aldrich]"
      >
        {/* Top Navigation / Header */}
        <div className="flex justify-between items-center p-6 border-b border-[#126382] bg-[rgba(0,14,30,0.8)] px-10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#0094FF1C] border border-[#126382] flex items-center justify-center text-[#00D1FF]">
              <FontAwesomeIcon icon={faProjectDiagram} />
            </div>
            <div>
              <h2 className="text-xl text-white tracking-widest uppercase">
                Groups <span className="text-[#00D1FF]">Explorer</span>
              </h2>
              <div className="text-[#A0DDFF] text-[10px] opacity-60">
                VIEWING FOR USER &gt; @{data?.telegram?.result?.user?.username || data?.telegram?.result?.user?.id}
              </div>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="group flex items-center gap-2 bg-transparent text-[#A0DDFF] border border-[#126382] px-4 py-2 rounded hover:bg-[#ff4b4b22] hover:text-white hover:border-[#ff4b4b] transition-all"
          >
            <span className="text-[10px] uppercase tracking-tighter">Close Analysis</span>
            <FontAwesomeIcon icon={faTimes} className="group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        {/* Main Graph Area */}
        <div className="flex-grow relative" ref={containerRef}>
          {dimensions.width > 0 && (
            <ForceGraph2D
              ref={fgRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={graphData}
            backgroundColor="rgba(0,0,0,0)"
            dagMode={null} 
            cooldownTicks={0} // MUST BE 0 to prevent D3 from destroying fx/fy layout on mount
            d3AlphaDecay={0.06} // Settle 3x faster
            d3VelocityDecay={0.6} // Higher friction to prevent vibration
            d3AlphaTarget={0.0001} // Ultra-low target keeps lines moving without vibrating nodes
            enableNodeDrag={true}
            enablePanInteraction={true}
            enableZoomInteraction={true}
            autoPauseRedraw={false}
            linkDirectionalParticles={1}
            linkDirectionalParticleWidth={0}
            onNodeDragEnd={node => {
              node.fx = node.x;
              node.fy = node.y;
            }}
            
            onNodeHover={(node) => {
              hoverNodeRef.current = node;
              if (containerRef.current) {
                containerRef.current.style.cursor = node && node.username ? 'pointer' : 'default';
              }
            }}
            onNodeClick={(node) => {
              if (node.username) {
                window.open(`https://t.me/${node.username}`, '_blank');
              }
            }}
            
            // CUSTOM LINK DRAWING (Animated Dotted Lines)
            linkCanvasObject={(link, ctx, globalScale) => {
              const { source, target } = link;
              if (!source || !target || typeof source !== 'object' || typeof target !== 'object') return;

              ctx.beginPath();
              ctx.moveTo(source.x, source.y);
              ctx.lineTo(target.x, target.y);
              ctx.strokeStyle = '#126382';
              ctx.lineWidth = 1 / globalScale;
              
              const dashLength = 3 / globalScale;
              const gapLength = 3 / globalScale;
              ctx.setLineDash([dashLength, gapLength]);
              
              const animationSpeed = 0.005;
              ctx.lineDashOffset = -(Date.now() * animationSpeed);
              
              ctx.stroke();
              
              // Reset line dash for other elements
              ctx.setLineDash([]);
            }}

            // HITBOX FIX FOR HOVER PRECISION
            nodePointerAreaPaint={(node, color, ctx, globalScale) => {
              const { w, h, x, y } = getNodeDimensions(node, ctx, globalScale);
              ctx.fillStyle = color;
              ctx.fillRect(x, y, w, h);
            }}

            // CUSTOM NODE DRAWING (Cards instead of Circles)
            nodeCanvasObject={(node, ctx, globalScale) => {
              const isHovered = hoverNodeRef.current === node;
              const { w, h, x, y, lines, padding, imgSize, spacing, lineHeight } = getNodeDimensions(node, ctx, globalScale);
              
              // Shadow/Glow (Only for root node, removed from groups)
              if (node.isRoot) {
                ctx.shadowColor = 'rgba(0, 209, 255, 0.5)';
                ctx.shadowBlur = 10 / globalScale;
              } else {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
              }

              // Node Background (Solid to hide lines)
              ctx.fillStyle = node.isRoot ? '#001a2c' : '#000810';
              
              // Draw rounded rectangle
              const cornerRadius = 8 / globalScale;
              ctx.beginPath();
              ctx.moveTo(x + cornerRadius, y);
              ctx.lineTo(x + w - cornerRadius, y);
              ctx.quadraticCurveTo(x + w, y, x + w, y + cornerRadius);
              ctx.lineTo(x + w, y + h - cornerRadius);
              ctx.quadraticCurveTo(x + w, y + h, x + w - cornerRadius, y + h);
              ctx.lineTo(x + cornerRadius, y + h);
              ctx.quadraticCurveTo(x, y + h, x, y + h - cornerRadius);
              ctx.lineTo(x, y + cornerRadius);
              ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
              ctx.closePath();
              ctx.fill();
              
              // Node Border
              ctx.strokeStyle = node.isRoot ? '#00D1FF' : '#126382';
              if (isHovered) {
                ctx.strokeStyle = '#3ac1ff';
                ctx.lineWidth = 1.5 / globalScale;
              } else {
                ctx.lineWidth = 1 / globalScale;
              }
              ctx.stroke();

              ctx.shadowBlur = 0; // Reset shadow

              // Draw Profile Image (Square) — batched & viewport-aware
              const cacheKey = node.username || node.id;
              // Queue the image load through the batched loader (max 30 concurrent, 200ms between batches)
              requestImage(cacheKey, buildProfilePfpUrl(node.username || node.id));
              const img = getImage(cacheKey);

              const imgX = x + (w / 2) - (imgSize / 2);
              const imgY = y + padding;

              if (img && img.complete && img.naturalWidth !== 0) {
                ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
              } else {
                // Placeholder while image is queued or loading
                ctx.fillStyle = '#126382';
                ctx.fillRect(imgX, imgY, imgSize, imgSize);
              }

              // Draw Text
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = node.isRoot ? '#FFFFFF' : '#A0DDFF';
              
              // Vertically center the text within the static text area
              const textStartY = imgY + imgSize + spacing;
              const effectiveStaticLines = Math.min(2, Math.ceil(node.name.split(' ').length / 2));
              const textAreaHeight = (effectiveStaticLines === 0 ? 1 : effectiveStaticLines) * lineHeight;
              const actualTextHeight = lines.length * lineHeight;
              const yOffset = (textAreaHeight - actualTextHeight) / 2;
              
              lines.forEach((line, i) => {
                ctx.fillText(line, node.x, textStartY + yOffset + (i * lineHeight));
              });
            }}
          />
          )}

          {/* Action Overlay */}
          <div className="absolute top-6 left-6 flex flex-col gap-3">
             <button 
              onClick={() => fgRef.current.zoomToFit(600, 10)}
              className="bg-[#0094FF1C] border border-[#126382] text-[#A0DDFF] p-3 rounded-lg hover:bg-[#0094ff3b] transition-all"
              title="Reset View"
            >
              <FontAwesomeIcon icon={faExpandArrowsAlt} />
            </button>
          </div>

          {/* Navigation Instructions */}
          <div className="absolute top-6 right-6 pointer-events-none">
            <div className="bg-[rgba(0,14,30,0.7)] border border-[#126382] p-4 rounded-lg backdrop-blur-md">
              <h4 className="text-[#00D1FF] text-[10px] uppercase tracking-widest mb-2 font-bold opacity-80 underline underline-offset-4">Controls</h4>
              <ul className="text-[10px] text-[#A0DDFF] space-y-1.5 opacity-90">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3ac1ff]"></span>
                  DRAG BACKGROUND TO PAN
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3ac1ff]"></span>
                  SCROLL MOUSE TO ZOOM
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3ac1ff]"></span>
                  DRAG INDIVIDUAL NODES
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Legend / Info Bar */}
        <div className="p-4 border-t border-[#126382] bg-[rgba(0,14,30,0.8)] flex justify-between px-10 items-center">
          <div className="flex gap-6 text-[10px] tracking-widest uppercase text-gray-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#00D1FF] rounded-sm"></span>
              Identity Root
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#126382] border border-[#3ac1ff] rounded-sm"></span>
              Associated Groups
            </div>
          </div>
          <div className="text-[10px] text-[#00D1FF] opacity-80 uppercase tracking-tighter">
            Nodes: {graphData.nodes.length} | Links: {graphData.links.length}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NodeVisualizer;
