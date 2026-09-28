import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExpandArrowsAlt } from '@fortawesome/free-solid-svg-icons';
import { getImage, isImageReady, requestImage, buildProfilePfpUrl } from './imageLoader';

const MiniVisualizer = ({ data, onExpand }) => {
  const fgRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 300, height: 220 });

  useEffect(() => {
    if (!containerRef.current) return;

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
  }, []);

  const graphData = useMemo(() => {
    if (!data?.telegram?.result?.user) return { nodes: [], links: [] };

    const user = data.telegram.result.user;
    const groups = (data.telegram.result.groups || []);

    const nodes = [
      {
        id: 'user-root',
        name: `@${user.username || user.id}`,
        username: user.username || null,
        val: 40,
        color: '#00D1FF',
        isRoot: true,
        x: 0,
        y: 0,
        fx: 0,
        fy: 0 
      },
      ...groups.map((g, i) => {
        // Multi-ring logic (2 rings with Outer Oval as requested)
        const isInnerRing = i < 14;
        const innerRadius = 100;
        const outerRadiusX = 230; // Stretched for sides
        const outerRadiusY = 160; // Compressed for top/bottom
        
        const nodesInRing = isInnerRing ? Math.min(14, groups.length) : (groups.length - 14);
        const indexInRing = isInnerRing ? i : (i - 14);
        const angle = (indexInRing / nodesInRing) * 2 * Math.PI;

        return {
          id: `group-${g.id}-${i}`,
          name: g.title || g.username || `ID: ${g.id}`,
          val: 12,
          color: '#126382',
          isRoot: false,
          x: isInnerRing ? Math.cos(angle) * innerRadius : Math.cos(angle) * outerRadiusX,
          y: isInnerRing ? Math.sin(angle) * innerRadius : Math.sin(angle) * outerRadiusY,
          fx: isInnerRing ? Math.cos(angle) * innerRadius : Math.cos(angle) * outerRadiusX,
          fy: isInnerRing ? Math.sin(angle) * innerRadius : Math.sin(angle) * outerRadiusY
        };
      })
    ];

    const links = groups.map((g, i) => ({
      source: 'user-root',
      target: `group-${g.id}-${i}`
    }));

    return { nodes, links };
  }, [data]);

  const fitView = useCallback(() => {
    if (fgRef.current && dimensions.width > 0) {
      // The outer oval is 250 on X axis and 160 on Y axis from center
      const contentWidth = (250 * 2) + 60; // outerRadiusX * 2 + label padding
      const contentHeight = (160 * 2) + 60; // outerRadiusY * 2 + label padding
      
      const scaleX = dimensions.width / contentWidth;
      const scaleY = dimensions.height / contentHeight;
      
      // Calculate perfect zoom to fit container
      const finalZoom = Math.min(scaleX, scaleY);
      
      // Instantly force exact position and scale
      fgRef.current.centerAt(0, 0, 0); 
      fgRef.current.zoom(finalZoom, 0); 
    }
  }, [dimensions]);

  useEffect(() => {
    if (!fgRef.current || graphData.nodes.length === 0) return;

    console.log('[MiniViz] useEffect fired - killing physics & fitting view. Nodes:', graphData.nodes.length);

    // Kill all physics to prevent the graph from resetting its own zoom/position
    try {
      fgRef.current.d3Force('charge', null);
      fgRef.current.d3Force('link', null);
      fgRef.current.d3Force('center', null);
    } catch(e) { console.warn('[MiniViz] d3Force not ready:', e); }

    // Force a fit-view on every data change or resize
    fitView();
    const timer1 = setTimeout(fitView, 300);
    const timer2 = setTimeout(fitView, 1000);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [graphData, dimensions, fitView]);

  const hasData = !!data?.telegram?.result?.user;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-[#0002025E] border border-[#126382] rounded-md overflow-hidden group">
      {hasData && (
        <>
          <div className="absolute top-2 right-2 z-10">
            <button
              onClick={onExpand}
              className="bg-[#0B2530] text-[#00D1FF] p-1.5 rounded border border-[#126382] hover:bg-[#126382] hover:text-white transition-all shadow-lg cursor-pointer"
              title="Expand View"
            >
              <FontAwesomeIcon icon={faExpandArrowsAlt} size="xs" />
            </button>
          </div>
      
          <div className="absolute top-1 left-2 z-10 pointer-events-none">
            <span className="text-[10px] text-[#00D1FF] font-[Aldrich] uppercase tracking-widest opacity-70">
              Visualizer
            </span>
          </div>

          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            backgroundColor="rgba(0,0,0,0)"
            width={dimensions.width}
            height={dimensions.height}
            cooldownTicks={0}
            enableNodeDrag={true}
            enablePanInteraction={true}
            enableZoomInteraction={true}
            autoPauseRedraw={false}
            d3AlphaDecay={0.02}
            onNodeDragEnd={node => {
              node.fx = node.x;
              node.fy = node.y;
            }}
            linkCanvasObject={(link, ctx, globalScale) => {
              const { source, target } = link;
              if (!source || !target || typeof source !== 'object' || typeof target !== 'object') return;

              ctx.beginPath();
              ctx.moveTo(source.x, source.y);
              ctx.lineTo(target.x, target.y);
              ctx.strokeStyle = 'rgba(18, 99, 130, 0.3)'; 
              ctx.lineWidth = 1 / globalScale;
              ctx.stroke();
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const size = node.isRoot ? 12 : 5;
          
              if (node.isRoot) {
                // Circular PFP for User
                const r = size;
                const cacheKey = node.username || node.id;
                // Use shared batched loader
                requestImage(cacheKey, buildProfilePfpUrl(node.username || node.id));
                const img = getImage(cacheKey);

                ctx.save();
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, Math.PI * 2, true);
                ctx.clip();

                if (img && img.complete && img.naturalWidth !== 0) {
                  ctx.drawImage(img, node.x - r, node.y - r, r * 2, r * 2);
                } else {
                  ctx.fillStyle = node.color;
                  ctx.fill();
                }
                ctx.restore();
            
                // Circular Border
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, Math.PI * 2, true);
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 2 / globalScale;
                ctx.stroke();
              } else {
                // Group Circles
                ctx.fillStyle = node.color;
                ctx.beginPath();
                ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
                ctx.fill();
                ctx.strokeStyle = 'rgba(0, 209, 255, 0.4)';
                ctx.lineWidth = 1 / globalScale;
                ctx.stroke();
              }
          
              // Labels
              const label = node.name;
              const fontSize = (node.isRoot ? 9 : 8) / globalScale;
              ctx.font = `${fontSize}px Aldrich`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = node.isRoot ? '#FFFFFF' : '#A0DDFF';
          
              const displayLabel = (node.isRoot || label.length <= 15) 
                ? label 
                : label.substring(0, 12) + '..';
          
              ctx.fillText(displayLabel, node.x, node.y + size + 2);
            }}
          />
        </>
      )}
    </div>
  );
};

export default MiniVisualizer;
