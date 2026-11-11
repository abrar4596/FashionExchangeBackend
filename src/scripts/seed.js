const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Listing = require('../models/Listing');
const SwapRequest = require('../models/SwapRequest');
const Message = require('../models/Message');

dotenv.config();

const seedData = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fashion_exchange';
    await mongoose.connect(uri);
    console.log('Connected to MongoDB for database seeding...');

    // Clean existing collections
    await User.deleteMany({});
    await Listing.deleteMany({});
    await SwapRequest.deleteMany({});
    await Message.deleteMany({});
    console.log('Cleared existing data.');

    // 1. Create Users
    const adminUser = await User.create({
      name: 'Admin Supervisor',
      email: 'admin@fashionexchange.com',
      password: 'password123',
      city: 'Mumbai',
      role: 'admin',
      bio: 'FashionExchange Platform Operations and Content Moderation Lead.',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=faces',
      completedSwapsCount: 25,
      activeListingsCount: 0,
    });

    const userElena = await User.create({
      name: 'Elena Vance',
      email: 'elena@example.com',
      password: 'password123',
      city: 'Bengaluru',
      role: 'user',
      bio: 'Passionate thrift curator & zero-waste lifestyle advocate. Loving vintage denim and oversized knitwear.',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop&crop=faces',
      completedSwapsCount: 8,
      activeListingsCount: 0,
    });

    const userMarcus = await User.create({
      name: 'Marcus Chen',
      email: 'marcus@example.com',
      password: 'password123',
      city: 'Mumbai',
      role: 'user',
      bio: 'Streetwear collector & vintage workwear enthusiast based in Mumbai. Open to trades for outerwear.',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=faces',
      completedSwapsCount: 14,
      activeListingsCount: 0,
    });

    const userMaya = await User.create({
      name: 'Maya Patel',
      email: 'maya@example.com',
      password: 'password123',
      city: 'Hyderabad',
      role: 'user',
      bio: 'Sustainable fashion designer refreshing her wardrobe every season with high quality natural fabrics.',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=faces',
      completedSwapsCount: 6,
      activeListingsCount: 0,
    });

    const userLeo = await User.create({
      name: 'Leo Rossi',
      email: 'leo@example.com',
      password: 'password123',
      city: 'Delhi',
      role: 'user',
      bio: 'Minimalist capsule wardrobe fan. Swapping warm jackets and boots for mid-layer fleece and shirts.',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=faces',
      completedSwapsCount: 4,
      activeListingsCount: 0,
    });

    console.log('Users created successfully.');

    // 2. Create Realistic Listings
    const listingsData = [
      {
        title: "Vintage Levi's 501 Original Fit Denim",
        description: 'Authentic 90s made in USA high-waisted straight leg 501s in a washed medium blue rinse. Button fly, 100% heavyweight cotton with natural fading.',
        category: 'Vintage',
        brand: "Levi's",
        size: 'M',
        condition: 'Very good',
        estimatedValue: 65,
        city: 'Bengaluru',
        images: [
          'https://images.unsplash.com/photo-1542272604-780c96856592?w=600&h=800&fit=crop',
          'https://images.unsplash.com/photo-1582552938357-32b906df40cb?w=600&h=800&fit=crop',
        ],
        owner: userElena._id,
        status: 'available',
      },
      {
        title: 'Patagonia Better Sweater 1/4-Zip Fleece',
        description: 'Classic knit fleece pullover in heathered stonewash grey. Perfect midlayer for chilly mornings, worn only twice. Zero pilling or signs of wear.',
        category: 'Men',
        brand: 'Patagonia',
        size: 'L',
        condition: 'New without tags',
        estimatedValue: 75,
        city: 'Mumbai',
        images: [
          'https://images.unsplash.com/photo-1578932750294-f5075e85f44a?w=600&h=800&fit=crop',
          'https://images.unsplash.com/photo-1544441893-675973e31985?w=600&h=800&fit=crop',
        ],
        owner: userMarcus._id,
        status: 'available',
      },
      {
        title: 'Reformation Floral Linen Midi Sundress',
        description: 'Lightweight breathable 100% French linen dress with sweetheart neckline, smocked back bodice, and side slit. Dainty wildflower print.',
        category: 'Women',
        brand: 'Reformation',
        size: 'S',
        condition: 'Very good',
        estimatedValue: 90,
        city: 'Hyderabad',
        images: [
          'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600&h=800&fit=crop',
          'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=600&h=800&fit=crop',
        ],
        owner: userMaya._id,
        status: 'available',
      },
      {
        title: 'Carhartt WIP Michigan Duck Canvas Chore Coat',
        description: 'Heavyweight organic cotton duck canvas in classic Hamilton Carhartt brown with corduroy collar and striped blanket lining. Extremely durable.',
        category: 'Men',
        brand: 'Carhartt',
        size: 'XL',
        condition: 'Good',
        estimatedValue: 110,
        city: 'Delhi',
        images: [
          'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&h=800&fit=crop',
          'https://images.unsplash.com/photo-1548883354-7622d03aca27?w=600&h=800&fit=crop',
        ],
        owner: userLeo._id,
        status: 'available',
      },
      {
        title: 'Chunky Ribbed Wool Oversized Cardigan',
        description: 'Soft merino wool blend knit sweater in warm oat cream. Dropped shoulders, tortoiseshell buttons, deep front pockets. Ideal for cozy autumn layers.',
        category: 'Women',
        brand: '& Other Stories',
        size: 'M',
        condition: 'Very good',
        estimatedValue: 55,
        city: 'Bengaluru',
        images: [
          'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600&h=800&fit=crop',
          'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=600&h=800&fit=crop',
        ],
        owner: userElena._id,
        status: 'available',
      },
      {
        title: 'New Balance 990v5 Made in USA Sneakers',
        description: 'Iconic grey pigskin suede and mesh upper with ENCAP midsole cushioning. Mens US 10.5 / EU 44.5. Light scuffs on outsole, original insoles included.',
        category: 'Shoes',
        brand: 'New Balance',
        size: 'L',
        condition: 'Good',
        estimatedValue: 95,
        city: 'Mumbai',
        images: [
          'https://images.unsplash.com/photo-1539185441755-769473a23570?w=600&h=800&fit=crop',
          'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=600&h=800&fit=crop',
        ],
        owner: userMarcus._id,
        status: 'available',
      },
      {
        title: 'Structured Italian Leather Crossbody Saddle Bag',
        description: 'Vegetable tanned full-grain cowhide leather bag in cognac tan with antique brass hardware and adjustable strap. Beautiful natural patina.',
        category: 'Accessories',
        brand: 'Cuyana',
        size: 'One size',
        condition: 'Very good',
        estimatedValue: 85,
        city: 'Hyderabad',
        images: [
          'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=600&h=800&fit=crop',
          'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&h=800&fit=crop',
        ],
        owner: userMaya._id,
        status: 'available',
      },
      {
        title: 'Authentic 90s Colorblock Windbreaker',
        description: 'Retro retro lightweight nylon shell jacket with vibrant teal, purple, and white colorblocking. Drawstring hem and packable hood.',
        category: 'Vintage',
        brand: 'Nike',
        size: 'L',
        condition: 'Very good',
        estimatedValue: 50,
        city: 'Delhi',
        images: [
          'https://images.unsplash.com/photo-1543087903-1ac2ec7aa8c5?w=600&h=800&fit=crop',
          'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&h=800&fit=crop',
        ],
        owner: userLeo._id,
        status: 'available',
      },
      {
        title: 'Little Cotton Clothes Embroidered Toddler Smock',
        description: 'Sweet organic cotton children overall smock in dusty sage green with hand-stitched floral embroidery on yoke. Size 2-3 years.',
        category: 'Kids',
        brand: 'Little Cotton Clothes',
        size: 'XS',
        condition: 'New with tags',
        estimatedValue: 35,
        city: 'Bengaluru',
        images: [
          'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=600&h=800&fit=crop',
          'https://images.unsplash.com/photo-1522771930-78848d9293e8?w=600&h=800&fit=crop',
        ],
        owner: userElena._id,
        status: 'available',
      },
      {
        title: 'Dr. Martens 1460 Smooth Leather 8-Eye Boots',
        description: 'Classic black smooth leather combat boots with yellow welt stitching and Goodyear-welted AirWair bouncy soles. Broken in gently, excellent condition.',
        category: 'Shoes',
        brand: 'Dr. Martens',
        size: 'M',
        condition: 'Good',
        estimatedValue: 80,
        city: 'Hyderabad',
        images: [
          'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=600&h=800&fit=crop',
        ],
        owner: userMaya._id,
        status: 'available',
      },
    ];

    const createdListings = await Listing.insertMany(listingsData);
    console.log(`Inserted ${createdListings.length} clothing listings.`);

    // Update active listings counts on users
    for (const user of [userElena, userMarcus, userMaya, userLeo]) {
      const count = await Listing.countDocuments({ owner: user._id, status: 'available' });
      user.activeListingsCount = count;
      await user.save();
    }

    // 3. Create Sample Swap Requests with Negotiation Threads
    // Marcus requests Elena's Levi's 501s and offers his Patagonia Fleece
    const elenaLevis = createdListings[0];
    const marcusFleece = createdListings[1];

    const sampleSwap1 = await SwapRequest.create({
      requester: userMarcus._id,
      receiver: userElena._id,
      requestedItem: elenaLevis._id,
      offeredItem: marcusFleece._id,
      status: 'pending',
      initialMessage: 'Hey Elena! Love these vintage 501s. Would you be down to swap for my Patagonia Better Sweater fleece? Estimated value is similar.',
      valueDifference: marcusFleece.estimatedValue - elenaLevis.estimatedValue,
    });

    await Message.create([
      {
        swapRequest: sampleSwap1._id,
        sender: userMarcus._id,
        text: 'Hey Elena! Love these vintage 501s. Would you be down to swap for my Patagonia Better Sweater fleece? Estimated value is similar.',
        type: 'swap_proposal',
      },
    ]);

    // Maya requests Leo's Carhartt jacket and offers her Reformation Dress
    const mayaDress = createdListings[2];
    const leoCarhartt = createdListings[3];

    const sampleSwap2 = await SwapRequest.create({
      requester: userMaya._id,
      receiver: userLeo._id,
      requestedItem: leoCarhartt._id,
      offeredItem: mayaDress._id,
      status: 'accepted',
      initialMessage: 'Hi Leo! Your Carhartt chore coat is amazing. I can trade my Reformation linen dress if you are interested!',
      valueDifference: mayaDress.estimatedValue - leoCarhartt.estimatedValue,
    });

    await Message.create([
      {
        swapRequest: sampleSwap2._id,
        sender: userMaya._id,
        text: 'Hi Leo! Your Carhartt chore coat is amazing. I can trade my Reformation linen dress if you are interested!',
        type: 'swap_proposal',
      },
      {
        swapRequest: sampleSwap2._id,
        sender: userLeo._id,
        text: 'Hey Maya, that dress looks stunning for my partner. Let’s do it! How do you want to handle the shipping?',
        type: 'text',
      },
      {
        swapRequest: sampleSwap2._id,
        sender: userLeo._id,
        text: 'Swap proposal accepted! Use this chat to coordinate exchange logistics or shipping terms.',
        type: 'agreement_confirmed',
      },
      {
        swapRequest: sampleSwap2._id,
        sender: userMaya._id,
        text: 'Awesome! I will box it up today and send you the USPS tracking number right here in this chat.',
        type: 'text',
      },
    ]);

    console.log('Seeded active swap requests and negotiation chat threads.');
    console.log('\n--- SEED COMPLETE ---');
    console.log('Default credentials:');
    console.log('  Admin:   admin@fashionexchange.com  / password123');
    console.log('  Users:   elena@example.com          / password123');
    console.log('           marcus@example.com         / password123');
    console.log('           maya@example.com           / password123');
    console.log('           leo@example.com            / password123');

    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seedData();
