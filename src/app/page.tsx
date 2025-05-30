"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, query, getDocs, orderBy, limit, where, doc, getDoc, addDoc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/firebase/config";
import { Product } from "@/types/product";
import FilterBar, { FilterOptions } from "@/components/products/FilterBar";
import ProductCard from "@/components/products/ProductCard";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ref, push, get } from "firebase/database";
import { rtdb } from "@/firebase/config";
import { getAuth, signOut } from "firebase/auth";

// შენახული პროდუქტების მდგომარეობა გლობალურ მასშტაბში
let cachedProducts: Product[] = [];
let cachedFilters: FilterOptions = {};
let hasInitialLoad = false;

// კატეგორიების სია FilterBar კომპონენტიდან
const categories = [
  "Entertainment",
  "Gaming",
  "Education",
  "Technology",
  "Business",
  "Lifestyle",
  "Travel",
  "Sports",
  "Food",
  "Fashion",
  "Other"
];

export default function Home() {
  const [products, setProducts] = useState<Product[]>(cachedProducts);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>(cachedProducts);
  const [isLoading, setIsLoading] = useState(!hasInitialLoad);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterOptions>(cachedFilters);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const router = useRouter();
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 48; // 4x12 grid

  // აღარ ვანახლებთ scroll position-ს რეფრეშის შემდეგ
  useEffect(() => {
    // მხოლოდ ერთხელ აღვადგენთ მონაცემებს localStorage-დან
    if (typeof window !== 'undefined' && !hasInitialLoad) {
      // Restore filter state
      const savedFilters = localStorage.getItem('filters');
      if (savedFilters) {
        try {
          const parsedFilters = JSON.parse(savedFilters);
          setFilters(parsedFilters);
          cachedFilters = parsedFilters;
        } catch (e) {
          console.error('Error parsing saved filters', e);
        }
      }

      // Restore pagination state
      const savedPage = localStorage.getItem('currentPage');
      if (savedPage) {
        setCurrentPage(parseInt(savedPage, 10));
      }
      
      // ვაფიქსირებთ წინა სქროლის პოზიციას რეფრეშის შემდეგ
      const savedScrollPosition = localStorage.getItem('scrollPosition');
      if (savedScrollPosition) {
        window.scrollTo(0, parseInt(savedScrollPosition, 10));
      }
    }
  }, []);

  // შევინახოთ scroll position windowStorage-ში რეფრეშის გარეშე
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // შევქმნათ იმის აღმომჩენი თუ როდის ტოვებს მომხმარებელი გვერდს
      const saveScrollPosition = () => {
        localStorage.setItem('scrollPosition', window.scrollY.toString());
      };

      // ვიყენებთ beforeunload event-ს რათა შევინახოთ სქროლის პოზიცია მაშინაც კი,
      // როდესაც მომხმარებელი ტოვებს გვერდს
      window.addEventListener('beforeunload', saveScrollPosition);
      
      // აგრეთვე პერიოდულად ვინახავთ სქროლის პოზიციას
      const scrollInterval = setInterval(saveScrollPosition, 1000);
      
      return () => {
        window.removeEventListener('beforeunload', saveScrollPosition);
        clearInterval(scrollInterval);
      };
    }
  }, []);

  // Save current page number in localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('currentPage', currentPage.toString());
    }
  }, [currentPage]);

  // Save filters in localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && Object.keys(filters).length > 0) {
      localStorage.setItem('filters', JSON.stringify(filters));
      cachedFilters = filters;
    }
  }, [filters]);

  // პროდუქტების ჩატვირთვა - მხოლოდ ერთხელ თუ ჯერ არ გვაქვს ჩატვირთული
  useEffect(() => {
    const fetchProducts = async () => {
      // თუ უკვე გვაქვს ჩატვირთული პროდუქტები, აღარ ჩავტვირთავთ ხელახლა
      if (hasInitialLoad && cachedProducts.length > 0) {
        setIsLoading(false);
        
        // გამოვიყენოთ კეშირებული პროდუქტები
        setProducts(cachedProducts);
        
        // გავფილტროთ მიმდინარე ფილტრების მიხედვით
        applyFilters(cachedProducts, filters);

        // თუ შენახულია სქროლის პოზიცია, აღვადგინოთ
        const savedScrollPos = sessionStorage.getItem('scrollPosition');
        const savedCurrentPage = sessionStorage.getItem('currentPage');
        
        if (savedCurrentPage) {
          setCurrentPage(parseInt(savedCurrentPage, 10));
        }
        
        // გამოვიყენოთ setTimeout, რათა დარწმუნებული ვიყოთ, რომ DOM-ი განახლებულია
        setTimeout(() => {
          if (savedScrollPos) {
            window.scrollTo(0, parseInt(savedScrollPos, 10));
          }
        }, 0);
        
        return;
      }
      
      try {
        setError(null);
        setIsLoading(true);

        // Create the query
        const q = query(
          collection(db, "products"),
          orderBy("createdAt", "desc"),
          limit(50)
        );

        // Execute the query
        const querySnapshot = await getDocs(q);
        const productsList = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        })) as Product[];

        // შევინახოთ პროდუქტები გლობალურ კეშში
        cachedProducts = productsList;
        hasInitialLoad = true;
        
        setProducts(productsList);
        applyFilters(productsList, filters);
        setIsLoading(false);

      } catch (err) {
        console.error("Error fetching products:", err);
        setError("Failed to load products");
        setIsLoading(false);
      }
    };

    fetchProducts();

    // დავამატოთ სქროლის პოზიციის შენახვა გვერდის დატოვებისას
    window.addEventListener('beforeunload', saveScrollPosition);
    
    return () => {
      window.removeEventListener('beforeunload', saveScrollPosition);
    };
  }, [filters]);

  // ფუნქცია სქროლის პოზიციის შესანახად
  const saveScrollPosition = () => {
    sessionStorage.setItem('scrollPosition', window.scrollY.toString());
    sessionStorage.setItem('currentPage', currentPage.toString());
  };

  // ცალკე ფუნქცია ფილტრაციისთვის
  const applyFilters = (productList: Product[], currentFilters: FilterOptions) => {
    let filtered = [...productList];

    // Filter by platform
    if (currentFilters.platform) {
      filtered = filtered.filter(product => 
        product.platform.toLowerCase() === currentFilters.platform?.toLowerCase()
      );
    }

    // Filter by category
    if (currentFilters.category) {
      filtered = filtered.filter(product => 
        product.category.toLowerCase() === currentFilters.category?.toLowerCase()
      );
    }

    // Filter by price range
    if (currentFilters.minPrice) {
      filtered = filtered.filter(product => product.price >= (currentFilters.minPrice || 0));
    }
    if (currentFilters.maxPrice) {
      filtered = filtered.filter(product => product.price <= (currentFilters.maxPrice || Infinity));
    }

    // Filter by subscribers
    if (currentFilters.minSubscribers) {
      filtered = filtered.filter(product => product.subscribers >= (currentFilters.minSubscribers || 0));
    }
    if (currentFilters.maxSubscribers) {
      filtered = filtered.filter(product => product.subscribers <= (currentFilters.maxSubscribers || Infinity));
    }

    // Filter by income
    if (currentFilters.minIncome) {
      filtered = filtered.filter(product => (product.income || 0) >= (currentFilters.minIncome || 0));
    }
    if (currentFilters.maxIncome) {
      filtered = filtered.filter(product => (product.income || 0) <= (currentFilters.maxIncome || Infinity));
    }

    // Filter by monetization
    if (currentFilters.monetization) {
      filtered = filtered.filter(product => product.monetization === true);
    }

    // Filter by search term
    if (currentFilters.search) {
      const searchLower = currentFilters.search.toLowerCase();
      filtered = filtered.filter(product => 
        product.displayName?.toLowerCase().includes(searchLower) || 
        product.description?.toLowerCase().includes(searchLower) ||
        product.platform?.toLowerCase().includes(searchLower) ||
        product.category?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredProducts(filtered);
  };

  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
  const indexOfLastProduct = currentPage * productsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
  const currentProducts = filteredProducts.slice(indexOfFirstProduct, indexOfLastProduct);

  const paginate = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    
    // Save the new page number
    localStorage.setItem('currentPage', pageNumber.toString());
    
    // Scroll to the top of the products grid or slightly higher
    const productsGrid = document.getElementById('productsGrid');
    if (productsGrid) {
      const gridTop = productsGrid.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: Math.max(0, gridTop - 80), // 80px above so navigation is visible
        behavior: 'smooth'
      });
    }
  };

  const handleFilterChange = (newFilters: FilterOptions) => {
    setFilters(newFilters);
    // When filters change, return to the first page
    setCurrentPage(1);
  };

  const handleContactSeller = async (productId: string, paymentMethod: string, useEscrow: boolean) => {
    if (!user) {
      // If user is not logged in, redirect to login page or show login modal
      // For simplicity, let's just alert for now
      alert("Authorization is required to contact the seller");
      router.push('/login');
      return;
    }

    try {
      console.log("Starting contact seller process...");
      console.log("Current user ID:", user.id);
      console.log("Product ID:", productId);

      // Get product details
      const productDocRef = doc(db, "products", productId);
      const productDoc = await getDoc(productDocRef);

      if (!productDoc.exists()) {
        alert("Product not found");
        return;
      }

      const product = {
        id: productDoc.id,
        ...productDoc.data()
      } as Product;

      console.log("Seller ID:", product.userId);

      // Don't allow contacting yourself
      if (user.id === product.userId) {
        alert("You cannot contact the seller for your own product");
        return;
      }

      // Check if a chat already exists
      const chatsQuery = query(
        collection(db, "chats"),
        where("productId", "==", product.id),
        where("participants", "array-contains", user.id)
      );

      console.log("Checking if chat exists for product:", product.id);
      const existingChats = await getDocs(chatsQuery);
      let chatId;
      
      if (!existingChats.empty) {
        // Chat already exists, use it
        chatId = existingChats.docs[0].id;
        console.log("Found existing chat:", chatId);
        
        // შევამოწმოთ არსებობს თუ არა შეტყობინებები ჩატში
        try {
          const rtdbMessagesRef = ref(rtdb, `messages/${chatId}`);
          const messagesSnapshot = await get(rtdbMessagesRef);
          
          if (!messagesSnapshot.exists()) {
            console.log("No messages found in existing chat. Adding initial purchase message.");
            
            // გავაგზავნოთ საწყისი შეტყობინება, თუ ჩატი ცარიელია
            const transactionId = Math.floor(1000000 + Math.random() * 9000000);
            
            await push(rtdbMessagesRef, {
              text: `🔒 Request to Purchase ${product.displayName}
Transaction ID: ${transactionId}
Transaction Amount: $${product.price}
Payment Method: ${paymentMethod === 'stripe' ? 'Stripe' : 'Bitcoin'}
The buyer pays the cost of the channel + 8% ($3 minimum) service fee.

The seller confirms and agrees to use the escrow service.

The escrow agent verifies everything and assigns manager rights to the buyer.

After 7 days (or sooner if agreed), the escrow agent removes other managers and transfers full ownership to the buyer.

The funds are then released to the seller. Payments are sent instantly via all major payment methods.`,
              senderId: user.id,
              senderName: user.name,
              senderPhotoURL: user.photoURL || null,
              timestamp: Date.now(),
              isRequest: true,
              isEscrowRequest: true,
              transactionData: {
                productId: product.id,
                productName: product.displayName,
                price: product.price,
                useEscrow: useEscrow,
                paymentMethod: paymentMethod,
                transactionId: transactionId
              }
            });
            
            console.log("Initial message added to existing empty chat");
            
            // განვაახლოთ lastMessage ჩატში
            const chatDocRef = doc(db, "chats", chatId);
            await updateDoc(chatDocRef, {
              lastMessage: {
                text: `🔒 Request to Purchase ${product.displayName}`,
                timestamp: Date.now(),
                senderId: user.id
              }
            });
          } else {
            console.log("Existing chat already has messages, not adding initial message");
          }
        } catch (rtdbError) {
          console.error("Error checking for messages in RTDB:", rtdbError);
        }
      } else {
        console.log("No existing chat found, creating new one...");
        
        // Make sure we have valid user IDs
        const buyerId = user.id;
        const sellerId = product.userId;
        
        console.log("Verified buyer ID:", buyerId);
        console.log("Verified seller ID:", sellerId);
        
        if (!buyerId || !sellerId) {
          console.error("Missing user IDs", { buyerId, sellerId });
          throw new Error("Missing user IDs");
        }

        // Create a new chat
        const chatData = {
          productId: product.id,
          productName: product.displayName,
          productImage: product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls[0] : "",
          participants: [buyerId, sellerId],
          participantNames: {
            [buyerId]: user.name || user.email?.split('@')[0] || "User",
            [sellerId]: product.userEmail?.split('@')[0] || "Seller"
          },
          participantPhotos: {
            [buyerId]: user.photoURL || "",
            [sellerId]: "" // Assuming no photo available
          },
          createdAt: Date.now(),
          adminJoined: false
        };

        try {
          // Explicitly create the chat document with a specific ID
          const chatRef = doc(collection(db, "chats"));
          chatId = chatRef.id;
          
          // Set the document with the ID
          await setDoc(chatRef, chatData);
          console.log("Created new chat with ID:", chatId);
          
          // Generate transaction ID
          const transactionId = Math.floor(1000000 + Math.random() * 9000000); // 7-digit random number
          
          // Create the first message with escrow request
          const purchaseMessage = {
            text: `🔒 Request to Purchase ${product.displayName}
Transaction ID: ${transactionId}
Transaction Amount: $${product.price}
Payment Method: ${paymentMethod === 'stripe' ? 'Stripe' : 'Bitcoin'}
The buyer pays the cost of the channel + 8% ($3 minimum) service fee.

The seller confirms and agrees to use the escrow service.

The escrow agent verifies everything and assigns manager rights to the buyer.

After 7 days (or sooner if agreed), the escrow agent removes other managers and transfers full ownership to the buyer.

The funds are then released to the seller. Payments are sent instantly via all major payment methods.`,
            senderId: user.id,
            senderName: user.name,
            senderPhotoURL: user.photoURL || null,
            timestamp: Date.now(),
            isRequest: true,
            isEscrowRequest: true,
            transactionData: {
              productId: product.id,
              productName: product.displayName,
              price: product.price,
              useEscrow: useEscrow,
              paymentMethod: paymentMethod,
              transactionId: transactionId
            }
          };
          
          // დავამატოთ მესიჯი რეალური დროის ბაზაში
          console.log("Adding purchase message to RTDB...");
          const messagesRef = ref(rtdb, `messages/${chatId}`);
          await push(messagesRef, purchaseMessage);
          console.log("Purchase message added to RTDB successfully");
          
          // განვაახლოთ ჩატში lastMessage ველი
          await updateDoc(doc(db, "chats", chatId), {
            lastMessage: {
              text: `🔒 Request to Purchase ${product.displayName}`,
              timestamp: Date.now(),
              senderId: user.id
            }
          });
          
          // Update the buyer's chatList
          console.log("Adding chat to buyer's chat list");
          const buyerChatListRef = doc(db, "users", buyerId, "chatList", chatId);
          await setDoc(buyerChatListRef, {
            chatId: chatId,
            productId: product.id,
            productName: product.displayName,
            productImage: product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls[0] : "",
            otherUserId: sellerId,
            otherUserName: product.userEmail?.split('@')[0] || "Seller",
            lastMessage: `🔒 Request to Purchase ${product.displayName}`,
            lastMessageTimestamp: Date.now(),
            unreadCount: 0,
            updatedAt: Date.now()
          });
          
          // Update the seller's chatList
          console.log("Adding chat to seller's chat list");
          const sellerChatListRef = doc(db, "users", sellerId, "chatList", chatId);
          await setDoc(sellerChatListRef, {
            chatId: chatId,
            productId: product.id,
            productName: product.displayName,
            productImage: product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls[0] : "",
            otherUserId: buyerId,
            otherUserName: user.name || user.email?.split('@')[0] || "User",
            lastMessage: `🔒 Request to Purchase ${product.displayName}`,
            lastMessageTimestamp: Date.now(),
            unreadCount: 1,
            updatedAt: Date.now()
          });
          
        } catch (chatError) {
          console.error("Error in chat creation process:", chatError);
          throw chatError; // Re-throw to be caught by the outer catch
        }
      }
      
      // შევინახოთ ბოლო ჩატის ID ლოკალურ სტორიჯში
      localStorage.setItem('lastChatId', chatId);
      
      // Redirect to the chat
      router.push(`/my-chats?chatId=${chatId}`);
    } catch (err) {
      console.error("Error in contact seller function:", err);
      // დეტალური შეცდომის ლოგირება
      if (err instanceof Error) {
        console.error("Error details:", err.message, err.stack);
      }
      alert("Failed to create chat. Please try again later.");
    }
  };

  // სკელეტონის კომპონენტი - ზუსტად მიმზგავსებული ProductCard-ის
  const ProductCardSkeleton = () => (
    <div className="bg-white rounded-lg shadow-md overflow-hidden transition-transform hover:shadow-lg w-full animate-pulse">
      {/* სურათის არეა - ზუსტად მიმზგავსებული Image ელემენტის */}
      <div className="relative aspect-[4/3] bg-gray-300">
        {/* წავშალოთ შავი წრეები */}
      </div>

      {/* კონტენტის არეა */}
      <div className="p-4">
        {/* პლატფორმა და კატეგორია */}
        <div className="flex justify-between items-center mb-2">
          <div className="px-2 py-1 bg-gray-200 rounded w-20 h-6"></div>
          <div className="w-24 h-4 bg-gray-200 rounded"></div>
        </div>

        {/* სათაური */}
        <div className="h-7 bg-gray-200 rounded w-3/4 mb-2"></div>

        {/* ფასი და გამომწერები */}
        <div className="flex justify-between items-center mb-3">
          <div className="h-7 w-16 bg-gray-200 rounded"></div>
          <div className="h-4 w-28 bg-gray-200 rounded"></div>
        </div>

        {/* ღილაკები */}
        <div className="flex justify-between gap-2">
          <div className="flex-1 h-10 bg-gray-200 rounded"></div>
          <div className="flex-1 h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  );

  // სკელეტონების მასივის შექმნა - იმდენი რამდენიც პროდუქტია ერთ გვერდზე
  const renderSkeletons = () => {
    return Array.from({ length: productsPerPage }).map((_, index) => (
      <div key={`skeleton-${index}`} className="h-[500px] flex">
        <ProductCardSkeleton />
      </div>
    ));
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Floating Action Button for adding new channel */}
      {user && (
        <button 
          onClick={() => {
            // თუ ლოკალურ სტორიჯში გვაქვს შენახული ბოლო ჩატის ID, პირდაპირ იმ ჩატზე გადავდივართ
            const lastChatId = localStorage.getItem('lastChatId');
            if (lastChatId) {
              router.push(`/my-chats?chatId=${lastChatId}`);
            } else {
              // თუ არა, მაშინ ზოგად ჩატების გვერდზე
              router.push('/my-chats');
            }
          }}
          className="fixed bottom-6 right-6 z-50 bg-indigo-600 text-white rounded-full p-4 shadow-lg hover:bg-indigo-700 transition-all duration-200 transform hover:scale-105 flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        </button>
      )}
      
      <div className="bg-[url('/background.jpeg')] bg-cover bg-center bg-no-repeat bg-fixed relative">
        <div className="absolute top-0 right-0 mr-3 mt-6 text-right z-10">
          {user ? (
            <div className="relative">
              <div className="flex items-center gap-2">
                <Link href="/products/new" className="px-4 py-2 bg-white text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors font-medium flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 mr-1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Channel
                </Link>
                <button 
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="flex items-center justify-center h-10 w-10 rounded-full bg-white text-indigo-600 border-2 border-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.name} className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <span className="font-bold text-lg">{user.email?.charAt(0).toUpperCase() || user.name?.charAt(0).toUpperCase() || "U"}</span>
                  )}
                </button>
              </div>
              
              {profileMenuOpen && (
                <div className="absolute top-12 right-0 bg-white rounded-lg shadow-xl w-64 overflow-hidden border border-gray-200 transition-all duration-200 transform origin-top-right">
                  <div className="bg-indigo-600 px-4 py-3 text-white">
                    <p className="font-medium truncate">{user.email || user.name}</p>
                  </div>
                  <div className="p-2">
                    <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">
                      <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-3 text-blue-500">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                        my profile
                      </div>
                    </Link>
                    <Link href="/my-favorites" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">
                      <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-3 text-pink-500">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                        </svg>
                        My Favorites
                      </div>
                    </Link>
                    <Link href="/transactions" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">
                      <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-3 text-green-500">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                        </svg>
                        My Transactions
                      </div>
                    </Link>
                    {user.isAdmin && (
                      <Link href="/admin" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">
                        <div className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-3 text-indigo-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Administrator
                        </div>
                      </Link>
                    )}
                    <hr className="my-2 border-gray-200" />
                    <button 
                      onClick={() => {
                        // გამოსვლა Firebase-დან
                        const auth = getAuth();
                        signOut(auth).then(() => {
                          // წარმატებით გამოვიდა
                          router.push('/');
                          // Cookies წაშლა
                          document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                          localStorage.removeItem('lastChatId');
                        }).catch((error) => {
                          console.error("Logout error:", error);
                        });
                      }} 
                      className="w-full mt-2 block px-4 py-2 text-left text-red-600 hover:bg-red-50 rounded"
                    >
                      <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-3 text-red-500">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                        </svg>
                        Logout
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button 
              onClick={() => router.push('/login')}
              className="px-4 py-2 bg-white text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors font-medium"
            >
              Login / Register
            </button>
          )}
        </div>
        
        <div className="absolute top-0 left-0 ml-3 mt-6">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            <div className="relative ml-2">
              <h1 className="text-2xl font-bold text-white">Accs-market</h1>
            </div>
            <span className="ml-1 bg-red-500 text-white text-xs px-1 rounded-full">β</span>
          </div>
          <p className="text-white text-sm mt-1">Quick & Secure social media marketplace.</p>
        </div>
        
        <div className="h-[80vh] flex justify-center items-center">
          <div className="max-w-4xl w-full bg-gradient-to-r from-blue-900/40 to-blue-600/40 backdrop-filter backdrop-blur-sm p-6 rounded-xl border border-blue-500/30">
            <div className="flex flex-wrap justify-center gap-3 mb-6">
              {["YouTube", "TikTok", "Twitter", "Instagram", "Facebook", "Telegram"].map((platform) => (
                <button
                  key={platform}
                  onClick={() => handleFilterChange({ ...filters, platform: filters.platform === platform ? undefined : platform })}
                  className={`px-4 py-1.5 rounded-full border ${
                    filters.platform === platform
                      ? "bg-white text-black border-white font-bold"
                      : "bg-transparent text-white border-white/50 hover:border-white hover:bg-white/20 font-bold"
                  }`}
                >
                  {platform}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Search by name"
              className="w-full px-4 py-2.5 rounded-md border border-blue-300/50 bg-white/10 focus:outline-none text-white font-medium placeholder-white/70"
              value={filters.search || ""}
              onChange={(e) => handleFilterChange({ ...filters, search: e.target.value })}
            />
            
            <div className="flex flex-col sm:flex-row gap-4 mt-6 justify-center">
              <div className="relative inline-block">
                <select
                  className="appearance-none px-4 py-1.5 pr-8 rounded-md border border-blue-300/50 bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 font-medium transition-colors"
                  value={filters.category || ""}
                  onChange={(e) => handleFilterChange({ ...filters, category: e.target.value })}
                >
                  <option value="" className="bg-slate-800 text-white">Select category</option>
                  {categories.map((category) => (
                    <option key={category} value={category} className="bg-slate-800 text-white">{category}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 011.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path>
                  </svg>
                </div>
              </div>
              
              <button
                onClick={() => handleFilterChange({ ...filters, monetization: !filters.monetization })}
                className={`px-4 py-1.5 rounded-md font-bold transition-colors ${
                  filters.monetization
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-800 text-white hover:bg-gray-700"
                }`}
              >
                Monetization enabled
              </button>
            </div>

            <div className="grid grid-cols-1 gap-0 mt-4 text-white">
              <div className="mb-0.5">
                <label className="block mb-0.5 font-bold text-white text-sm">Subscribers:</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="from"
                    className="w-full px-3 py-1 rounded-md border border-blue-300/50 bg-white/10 text-white focus:outline-none font-medium text-sm placeholder-white/70"
                    value={filters.minSubscribers || ""}
                    onChange={(e) => handleFilterChange({ ...filters, minSubscribers: e.target.value ? Number(e.target.value) : undefined })}
                  />
                  <span className="text-white font-bold">—</span>
                  <input
                    type="text"
                    placeholder="to"
                    className="w-full px-3 py-1 rounded-md border border-blue-300/50 bg-white/10 text-white focus:outline-none font-medium text-sm placeholder-white/70"
                    value={filters.maxSubscribers || ""}
                    onChange={(e) => handleFilterChange({ ...filters, maxSubscribers: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
              </div>

              <div className="mb-0.5">
                <label className="block mb-0.5 font-bold text-white text-sm">Price:</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="from"
                    className="w-full px-3 py-1 rounded-md border border-blue-300/50 bg-white/10 text-white focus:outline-none font-medium text-sm placeholder-white/70"
                    value={filters.minPrice || ""}
                    onChange={(e) => handleFilterChange({ ...filters, minPrice: e.target.value ? Number(e.target.value) : undefined })}
                  />
                  <span className="text-white font-bold">—</span>
                  <input
                    type="text"
                    placeholder="to"
                    className="w-full px-3 py-1 rounded-md border border-blue-300/50 bg-white/10 text-white focus:outline-none font-medium text-sm placeholder-white/70"
                    value={filters.maxPrice || ""}
                    onChange={(e) => handleFilterChange({ ...filters, maxPrice: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
              </div>

              <div className="mb-0.5">
                <label className="block mb-0.5 font-bold text-white text-sm">Income:</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="from"
                    className="w-full px-3 py-1 rounded-md border border-blue-300/50 bg-white/10 text-white focus:outline-none font-medium text-sm placeholder-white/70"
                    value={filters.minIncome || ""}
                    onChange={(e) => handleFilterChange({ ...filters, minIncome: e.target.value ? Number(e.target.value) : undefined })}
                  />
                  <span className="text-white font-bold">—</span>
                  <input
                    type="text"
                    placeholder="to"
                    className="w-full px-3 py-1 rounded-md border border-blue-300/50 bg-white/10 text-white focus:outline-none font-medium text-sm placeholder-white/70"
                    value={filters.maxIncome || ""}
                    onChange={(e) => handleFilterChange({ ...filters, maxIncome: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 text-center">
              <button 
                className="px-10 py-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition duration-200 font-bold"
                onClick={() => {
                  handleFilterChange(filters);
                  // Scroll to the top of the products section smoothly
                  const productsGrid = document.getElementById('productsGrid');
                  if (productsGrid) {
                    productsGrid.scrollIntoView({ 
                      behavior: 'smooth',
                      block: 'start'
                    });
                  }
                }}
              >
                Search
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="w-full py-8 flex-grow bg-gradient-to-b from-cyan-500/60 to-indigo-900/70 backdrop-filter backdrop-blur-sm">
        <div className="container mx-auto px-4">
          {/* აქ ვშლი სორტირების ელემენტს */}
        
          {/* Products Grid */}
            {error ? (
              <div className="bg-red-900/70 text-white p-6 rounded-lg border border-red-700/50 backdrop-filter backdrop-blur-sm">
                <p className="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2 text-red-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  {error}
                </p>
              </div>
            ) : filteredProducts.length === 0 && !isLoading ? (
              <div className="text-center py-12 bg-sky-900/70 text-white rounded-lg shadow-lg border border-sky-700/50 backdrop-filter backdrop-blur-sm p-6">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-blue-400 mb-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <h3 className="text-xl font-medium mb-2">No Results Found</h3>
                <p className="text-blue-100 mb-4">Try adjusting your filters or search term</p>
                <button
                  onClick={() => setFilters({})}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div id="productsGrid" className="scroll-mt-20 p-6 rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
                  {isLoading ? renderSkeletons() : currentProducts.map((product) => (
                    <div 
                      key={product.id} 
                      className="h-[500px] flex"
                    >
                      <ProductCard 
                        product={product} 
                        onContactSeller={handleContactSeller}
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {!isLoading && totalPages > 1 && (
                  <div className="flex justify-center mt-10 mb-6">
                    <nav className="inline-flex rounded-md shadow">
                      <button
                        onClick={() => paginate(currentPage > 1 ? currentPage - 1 : currentPage)}
                        disabled={currentPage === 1}
                        className="px-4 py-2 rounded-l-md border border-blue-400/30 bg-gradient-to-r from-blue-800/60 to-blue-600/60 text-white hover:from-blue-700/60 hover:to-blue-500/60 disabled:opacity-50 disabled:hover:from-blue-800/60 disabled:hover:to-blue-600/60"
                      >
                        Previous
                      </button>
                      
                      {[...Array(totalPages)].map((_, i) => {
                        const pageNumber = i + 1;
                        // Show at most 5 page numbers: current, two before and two after
                        if (
                          pageNumber === 1 ||
                          pageNumber === totalPages ||
                          (pageNumber >= currentPage - 2 && pageNumber <= currentPage + 2)
                        ) {
                          return (
                            <button
                              key={pageNumber}
                              onClick={() => paginate(pageNumber)}
                              className={`px-4 py-2 border border-blue-400/30 ${
                                pageNumber === currentPage
                                  ? "bg-blue-600 text-white font-bold"
                                  : "bg-gradient-to-r from-blue-800/60 to-blue-600/60 text-white hover:from-blue-700/60 hover:to-blue-500/60"
                              }`}
                            >
                              {pageNumber}
                            </button>
                          );
                        }
                        // Add ellipsis for skipped numbers
                        if (
                          (pageNumber === currentPage - 3 && currentPage > 3) ||
                          (pageNumber === currentPage + 3 && currentPage < totalPages - 2)
                        ) {
                          return (
                            <button
                              key={pageNumber}
                              disabled
                              className="px-4 py-2 border border-blue-400/30 bg-gradient-to-r from-blue-800/60 to-blue-600/60 text-white"
                            >
                              ...
                            </button>
                          );
                        }
                        return null;
                      })}
                      
                      <button
                        onClick={() => paginate(currentPage < totalPages ? currentPage + 1 : currentPage)}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 rounded-r-md border border-blue-400/30 bg-gradient-to-r from-blue-800/60 to-blue-600/60 text-white hover:from-blue-700/60 hover:to-blue-500/60 disabled:opacity-50 disabled:hover:from-blue-800/60 disabled:hover:to-blue-600/60"
                      >
                        Next
                      </button>
                    </nav>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>
      
      {/* Footer */}
      <footer className="bg-gray-900 text-white py-4 px-6 mt-auto">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <div className="text-sm">MateSwap LP</div>
            <div className="text-xs text-gray-400">Address: 85 First Floor Great Portland Street, London, England, W1W 7LT</div>
          </div>
          <div className="flex space-x-6">
            <Link href="/terms" className="text-sm hover:text-gray-300 transition-colors">
              Terms and Conditions
            </Link>
            <Link href="/privacy" className="text-sm hover:text-gray-300 transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
