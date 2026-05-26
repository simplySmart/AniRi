import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Bookmark, Menu, Download, 
  Calendar, Users, Monitor, SlidersHorizontal, 
  Clock, TrendingUp, ArrowUpDown, List, 
  LayoutGrid, MoreVertical, ArrowUp, Magnet,
  Image as ImageIcon, Loader2
} from 'lucide-react';

// --- Constants & Config ---
const PROXY_URL = "https://api.allorigins.win/raw?url=";
const JIKAN_API = "https://api.jikan.moe/v4/anime?q=";
const STORAGE_KEYS = {
  ITEMS: 'nexttosho_items',
  IMAGES: 'nexttosho_images',
  FILTERS: 'nexttosho_filters'
};

// --- Helper Functions ---
const parseXML = (xmlString) => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, "text/xml");
  const items = xml.querySelectorAll("item");
  
  return Array.from(items).map(item => {
    const title = item.querySelector("title")?.textContent || "";
    const size = item.getElementsByTagNameNS("*", "size")[0]?.textContent || "Unknown";
    const seeders = parseInt(item.getElementsByTagNameNS("*", "seeders")[0]?.textContent || "0");
    const infoHash = item.getElementsByTagNameNS("*", "infoHash")[0]?.textContent || "";
    const link = item.querySelector("link")?.textContent || "";
    const pubDate = item.querySelector("pubDate")?.textContent || "";
    const guid = item.querySelector("guid")?.textContent || infoHash;

    // Parse the Title
    let group = "Unknown";
    const groupMatch = title.match(/^\[(.*?)\]/);
    if (groupMatch) group = groupMatch[1];

    let resolution = "Unknown";
    if (title.includes("1080p")) resolution = "1080p";
    else if (title.includes("720p")) resolution = "720p";
    else if (title.includes("480p")) resolution = "480p";

    // Clean title for image searching
    let cleanTitle = title
      .replace(/^\[.*?\]/, '') 
      .replace(/\[.*?\]/g, '') 
      .replace(/\(.*?p\)/g, '') 
      .replace(/\.mkv|\.mp4/g, '') 
      .replace(/-\s*\d+(?:\.\d+)?/g, '') 
      .replace(/v\d+/g, '') 
      .split(' Season ')[0]
      .split(' Part ')[0]
      .trim();

    // Extract Episode
    let episode = "??";
    const epMatch = title.match(/-\s*(\d+(?:\.\d+)?)/);
    if (epMatch) episode = `S1E${epMatch[1]}`;

    return {
      id: guid,
      rawTitle: title,
      cleanTitle,
      group,
      resolution,
      episode,
      size,
      seeders,
      infoHash,
      link,
      pubDate: new Date(pubDate).toISOString(),
      magnet: `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce`
    };
  });
};

const delay = (ms) => new Promise(res => setTimeout(res, ms));

// --- Main Component ---
export default function App() {
  const [items, setItems] = useState([]);
  const [images, setImages] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [viewMode, setViewMode] = useState('list'); 
  
  const [filters, setFilters] = useState({
    season: 'All Seasons',
    group: 'SubsPlease', 
    resolution: '1080p', 
    sort: 'Latest'
  });

  const imageQueueRef = useRef(new Set());
  const processingQueueRef = useRef(false);

  useEffect(() => {
    const cachedItems = localStorage.getItem(STORAGE_KEYS.ITEMS);
    const cachedImages = localStorage.getItem(STORAGE_KEYS.IMAGES);
    const cachedFilters = localStorage.getItem(STORAGE_KEYS.FILTERS);

    if (cachedItems) setItems(JSON.parse(cachedItems));
    if (cachedImages) setImages(JSON.parse(cachedImages));
    if (cachedFilters) setFilters(JSON.parse(cachedFilters));

    fetchData(1, true); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (items.length > 0) localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items.slice(0, 100))); 
  }, [items]);

  useEffect(() => {
    if (Object.keys(images).length > 0) localStorage.setItem(STORAGE_KEYS.IMAGES, JSON.stringify(images));
  }, [images]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FILTERS, JSON.stringify(filters));
    fetchData(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.group, filters.resolution, filters.sort]);

  const processImageQueue = async () => {
    if (processingQueueRef.current || imageQueueRef.current.size === 0) return;
    processingQueueRef.current = true;

    const titlesToFetch = Array.from(imageQueueRef.current);
    
    for (const title of titlesToFetch) {
      if (images[title] !== undefined) {
        imageQueueRef.current.delete(title);
        continue; 
      }

      try {
        const query = encodeURIComponent(title.substring(0, 40)); 
        const res = await fetch(`${JIKAN_API}${query}&limit=1`);
        if (res.status === 429) {
          await delay(2000); 
          break; 
        }
        
        const data = await res.json();
        const imageUrl = data?.data?.[0]?.images?.webp?.large_image_url || null;
        
        setImages(prev => ({ ...prev, [title]: imageUrl }));
        imageQueueRef.current.delete(title);
      } catch (err) {
        setImages(prev => ({ ...prev, [title]: null })); 
        imageQueueRef.current.delete(title);
      }
      
      await delay(500); 
    }

    processingQueueRef.current = false;
    if (imageQueueRef.current.size > 0) {
      setTimeout(processImageQueue, 1000);
    }
  };

  useEffect(() => {
    let newTitlesAdded = false;
    items.forEach(item => {
      if (images[item.cleanTitle] === undefined && !imageQueueRef.current.has(item.cleanTitle)) {
        imageQueueRef.current.add(item.cleanTitle);
        newTitlesAdded = true;
      }
    });

    if (newTitlesAdded) {
      processImageQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, images]);

  const fetchData = async (pageNum = 1, reset = false) => {
    if (reset) {
      setLoading(true);
      setPage(1);
    } else {
      setLoadingMore(true);
    }

    try {
      let queryParts = [];
      if (filters.group && filters.group !== 'All Groups') queryParts.push(filters.group);
      if (filters.resolution && filters.resolution !== 'All Res') queryParts.push(filters.resolution);
      const query = queryParts.join(' ');
      
      let sortParam = "&s=id&o=desc"; 
      if (filters.sort === 'Most Seeded') sortParam = "&s=seeders&o=desc";
      else if (filters.sort === 'A - Z') sortParam = "&s=size&o=desc"; 
      
      const nyaaUrl = `https://nyaa.si/?page=rss&c=1_2&q=${encodeURIComponent(query)}&p=${pageNum}${sortParam}`;
      const res = await fetch(PROXY_URL + encodeURIComponent(nyaaUrl));
      
      if (!res.ok) throw new Error("Network response was not ok");
      const xmlText = await res.text();
      const parsedItems = parseXML(xmlText);

      if (filters.sort === 'A - Z') {
         parsedItems.sort((a, b) => a.cleanTitle.localeCompare(b.cleanTitle));
      }

      if (parsedItems.length === 0) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }

      setItems(prev => reset ? parsedItems : [...prev, ...parsedItems]);
      if (!reset) setPage(pageNum);

    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const groupedItems = items.reduce((groups, item) => {
    const date = new Date(item.pubDate);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = new Date(today.setDate(today.getDate() - 1)).toDateString() === date.toDateString();
    
    let key = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    if (isToday) key = "Today";
    if (isYesterday) key = "Yesterday";
    if (filters.sort === 'A - Z') key = "All Releases"; 

    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-gray-900 font-sans">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="text-xl font-bold tracking-tight text-gray-900">NEXTTOSHO</div>
        <div className="flex items-center gap-6 text-gray-600">
          <button className="hover:text-purple-600 transition-colors"><Search size={22} /></button>
          <button className="hover:text-purple-600 transition-colors"><Bookmark size={22} /></button>
          <button className="hover:text-purple-600 transition-colors"><Menu size={24} /></button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="bg-purple-100 text-purple-600 p-2.5 rounded-xl">
              <Download size={28} strokeWidth={2.5} />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Releases</h1>
          </div>
          <p className="text-gray-500 ml-[58px]">Latest anime episode releases from your favorite fansub groups.</p>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="relative flex-1 min-w-[160px]">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <select 
              value={filters.season}
              onChange={(e) => handleFilterChange('season', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl appearance-none outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 transition-all font-medium text-gray-700"
            >
              <option>All Seasons</option>
              <option>Spring 2024</option>
              <option>Winter 2024</option>
            </select>
          </div>
          <div className="relative flex-1 min-w-[160px]">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <select 
              value={filters.group}
              onChange={(e) => handleFilterChange('group', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl appearance-none outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 transition-all font-medium text-gray-700"
            >
              <option>All Groups</option>
              <option>SubsPlease</option>
              <option>Erai-raws</option>
              <option>EMBER</option>
              <option>ASW</option>
            </select>
          </div>
          <div className="relative flex-1 min-w-[160px]">
            <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <select 
              value={filters.resolution}
              onChange={(e) => handleFilterChange('resolution', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl appearance-none outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 transition-all font-medium text-gray-700"
            >
              <option>All Res</option>
              <option>1080p</option>
              <option>720p</option>
              <option>480p</option>
            </select>
          </div>
          <button className="bg-purple-50 text-purple-600 p-2.5 rounded-xl border border-purple-100 hover:bg-purple-100 transition-colors shrink-0">
            <SlidersHorizontal size={22} />
          </button>
        </div>

        {/* Sort & View Toggles */}
        <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-1 mb-8 shadow-sm">
          <div className="flex gap-1 flex-1 overflow-x-auto no-scrollbar">
            {['Latest', 'Most Seeded', 'A - Z'].map(sort => (
              <button 
                key={sort}
                onClick={() => handleFilterChange('sort', sort)}
                className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  filters.sort === sort ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {sort === 'Latest' && <Clock size={16} />}
                {sort === 'Most Seeded' && <TrendingUp size={16} />}
                {sort === 'A - Z' && <ArrowUpDown size={16} />}
                {sort}
              </button>
            ))}
          </div>
          <div className="flex gap-1 px-2 border-l border-gray-100">
            <button 
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-purple-100 text-purple-700' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <List size={20} />
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-purple-100 text-purple-700' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <LayoutGrid size={20} />
            </button>
          </div>
        </div>

        {/* Content List */}
        {loading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
            <Loader2 className="animate-spin text-purple-500" size={32} />
            <p>Fetching releases...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(groupedItems).map(([dateLabel, groupItems]) => (
              <div key={dateLabel}>
                {filters.sort !== 'A - Z' && (
                  <h3 className="text-gray-400 font-bold text-sm uppercase tracking-wider mb-4 ml-1">{dateLabel}</h3>
                )}
                <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
                  {groupItems.map(item => (
                    <ReleaseCard 
                      key={item.id} 
                      item={item} 
                      imageUrl={images[item.cleanTitle]} 
                      viewMode={viewMode}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Infinite Scroll Trigger / Load More */}
        {items.length > 0 && hasMore && (
          <div className="mt-10 flex justify-center">
            <button 
              onClick={() => fetchData(page + 1)}
              disabled={loadingMore}
              className="bg-white border border-gray-200 text-gray-700 font-semibold py-3 px-8 rounded-xl shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-all flex items-center gap-2"
            >
              {loadingMore ? <Loader2 className="animate-spin" size={18} /> : null}
              {loadingMore ? 'Loading...' : 'Load More Releases'}
            </button>
          </div>
        )}

        {!hasMore && items.length > 0 && (
           <div className="mt-10 text-center text-gray-400 font-medium">No more releases found for this filter.</div>
        )}

      </main>
    </div>
  );
}

// --- Sub Components ---
function ReleaseCard({ item, imageUrl, viewMode }) {
  const isList = viewMode === 'list';
  
  const CustomMagnet = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 8V12C5 15.866 8.13401 19 12 19C15.866 19 19 15.866 19 12V8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 8V4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 8V4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2.5 8H7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16.5 8H21.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group ${isList ? 'flex items-center p-3 gap-5' : 'flex flex-col p-4 gap-4'}`}>
      
      {/* Thumbnail */}
      <div className={`relative shrink-0 overflow-hidden rounded-xl bg-gray-100 border border-gray-200 ${isList ? 'w-40 h-[90px]' : 'w-full aspect-video'}`}>
        {imageUrl ? (
          <img 
            src={imageUrl} 
            alt={item.cleanTitle} 
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
          />
        ) : null}
        
        {/* Fallback Image */}
        <div className={`absolute inset-0 flex items-center justify-center text-gray-300 ${imageUrl ? 'hidden' : 'flex'}`}>
          <ImageIcon size={32} />
        </div>
      </div>

      {/* Content Info */}
      <div className="flex-1 min-w-0">
        <h2 className="font-bold text-gray-900 text-lg truncate mb-2" title={item.cleanTitle}>
          {item.cleanTitle}
        </h2>
        
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="px-2.5 py-1 bg-[#F3F4F6] text-gray-600 text-xs font-semibold rounded-md border border-gray-200">
            {item.episode}
          </span>
          <span className="px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded-md border border-purple-100">
            {item.resolution}
          </span>
          <span className="px-2.5 py-1 bg-white text-gray-500 text-xs font-semibold rounded-md border border-gray-200">
            {item.size}
          </span>
        </div>

        <div className="flex items-center text-sm">
          <span className={`font-bold ${item.group === 'SubsPlease' ? 'text-purple-600' : item.group === 'Erai-raws' ? 'text-green-600' : item.group === 'EMBER' ? 'text-orange-500' : 'text-blue-600'}`}>
            {item.group}
          </span>
          <span className="text-gray-300 mx-2">•</span>
          <div className="flex items-center text-gray-500 font-semibold gap-1">
            <ArrowUp size={14} className="text-green-500 stroke-[3]" />
            {item.seeders.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className={`flex items-center gap-2 shrink-0 ${isList ? 'ml-auto pl-4' : 'justify-end border-t border-gray-100 pt-3 mt-auto'}`}>
        <a href={item.link} className="p-2.5 text-gray-400 hover:text-gray-900 transition-colors bg-gray-50 hover:bg-gray-100 rounded-xl" title="Download Torrent">
          <Download size={20} />
        </a>
        <a href={item.magnet} className="p-2.5 text-purple-600 hover:text-white transition-colors bg-purple-50 hover:bg-purple-600 rounded-xl shadow-sm" title="Magnet Link">
          <CustomMagnet />
        </a>
        <button className="p-2.5 text-gray-400 hover:text-gray-900 transition-colors">
          <MoreVertical size={20} />
        </button>
      </div>
    </div>
  );
}
