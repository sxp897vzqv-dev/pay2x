import { useMemo, useState, useCallback, useRef, useEffect } from 'react';

/**
 * Simple virtual list hook for rendering large lists efficiently
 * @param {Array} items - The full array of items
 * @param {Object} options - Configuration options
 * @param {number} options.itemHeight - Fixed height of each item in pixels
 * @param {number} options.overscan - Number of items to render above/below viewport (default: 5)
 * @param {number} options.containerHeight - Height of the scrollable container
 */
export function useVirtualList(items, options = {}) {
  const {
    itemHeight = 100,
    overscan = 5,
    containerHeight = 600,
  } = options;

  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);

  // Calculate visible range
  const { visibleItems, startIndex, totalHeight, offsetY } = useMemo(() => {
    const totalCount = items.length;
    const totalHeight = totalCount * itemHeight;
    
    // Calculate visible window
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      totalCount - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );
    
    const visibleItems = items.slice(startIndex, endIndex + 1).map((item, i) => ({
      ...item,
      _virtualIndex: startIndex + i,
    }));
    
    const offsetY = startIndex * itemHeight;
    
    return { visibleItems, startIndex, totalHeight, offsetY };
  }, [items, itemHeight, overscan, containerHeight, scrollTop]);

  // Handle scroll
  const handleScroll = useCallback((e) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Reset scroll when items change significantly
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [items.length]);

  return {
    containerRef,
    containerProps: {
      ref: containerRef,
      onScroll: handleScroll,
      style: {
        height: containerHeight,
        overflow: 'auto',
        position: 'relative',
      },
    },
    innerProps: {
      style: {
        height: totalHeight,
        position: 'relative',
      },
    },
    itemsContainerProps: {
      style: {
        position: 'absolute',
        top: offsetY,
        left: 0,
        right: 0,
      },
    },
    visibleItems,
    totalCount: items.length,
    startIndex,
  };
}

/**
 * Virtual list component wrapper
 */
export function VirtualList({ 
  items, 
  itemHeight = 100, 
  containerHeight = 600, 
  overscan = 5,
  renderItem,
  className = '',
  emptyMessage = 'No items to display',
}) {
  const { containerProps, innerProps, itemsContainerProps, visibleItems, totalCount } = useVirtualList(
    items,
    { itemHeight, containerHeight, overscan }
  );

  if (totalCount === 0) {
    return (
      <div className={`flex items-center justify-center text-slate-400 ${className}`} style={{ height: containerHeight }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div {...containerProps} className={className}>
      <div {...innerProps}>
        <div {...itemsContainerProps}>
          {visibleItems.map((item, i) => (
            <div key={item.id || item._virtualIndex} style={{ height: itemHeight }}>
              {renderItem(item, item._virtualIndex)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default useVirtualList;
