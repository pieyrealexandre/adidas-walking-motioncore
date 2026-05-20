// Airtable integration is PAUSED.
//
// The endpoint URL, auth (Supabase JWT), URL-param validation, and response
// shape are all preserved so the Toolkit cropping journey (step 1 → step 2)
// keeps working unchanged. But the only campaign ID that returns data is
// PLACEHOLDER_CAMPAIGN_ID below — any other ID returns 404, and there is no
// `fetch('https://api.airtable.com/...')` left in this file. The Airtable
// PAT in env is therefore unreachable from this route by design.
//
// To re-enable the real integration, restore the previous version of this
// file from git (it implemented the validated CONTENT PLAN → Component
// Library → COMPONENT_DIMENSIONS lookup described in AIRTABLE_INTEGRATION.md
// and TOOLKIT_CROPPING_JOURNEY.md § "Airtable touchpoints endpoint").

const COMPONENT_DIMENSIONS = {
  'Banner Hero':        { mobile: [750, 964],   desktop: [2880, 1280], tablet: [1600, 1600] },
  'Card Teaser':        { mobile: [1050, 1400], desktop: [1050, 1400], tablet: [1050, 1400] },
  'Banner Snippet':     { mobile: [1200, 900],  desktop: [1440, 1080], tablet: [1024, 768]  },
  'Group Media':        { mobile: [594, 792],   desktop: [594, 792],   tablet: [594, 792]   },
  'Drop Card':          { mobile: [960, 1440],  desktop: [960, 1440],  tablet: [960, 1440]  },
  'Header Asset':       { mobile: [960, 1440],  desktop: [960, 1440],  tablet: [960, 1440]  },
  'Group header':       { mobile: [960, 1440],  desktop: [960, 1440],  tablet: [960, 1440]  },
  'Drop Detail Card':   { mobile: [960, 1440],  desktop: [960, 1440],  tablet: [960, 1440]  },
  'Hero Block':         { mobile: [320, 350],   desktop: [640, 440],   tablet: null         },
  'Hero Block - Image': { mobile: [320, 350],   desktop: [640, 440],   tablet: null         },
};

const PLACEHOLDER_CAMPAIGN_ID = 'DEMOCAMPAIGN0001';

// Fixed set of 8 touchpoints returned for the placeholder campaign. Picked
// to span varied AR dimensions and to map (where possible) to known copy
// generator touchpoint IDs (`{abb}-{slug(componentName)}`), so the copy
// fan-out also exercises real prompts.
const PLACEHOLDER_TOUCHPOINTS_BASE = [
  {
    contentPlanId: 'demo-row-01',
    contentName: 'demo--launch-hp-banner_hero_1',
    componentName: 'Banner Hero',
    channel: '.COM',
    phase: 'Launch',
    touchpoints: ['HOMEPAGE'],
    touchpointAbbreviations: ['HP'],
    cropsRequired: ['mobile', 'desktop', 'tablet'],
  },
  {
    contentPlanId: 'demo-row-02',
    contentName: 'demo--launch-hp-card_teaser_1',
    componentName: 'Card Teaser',
    channel: '.COM',
    phase: 'Launch',
    touchpoints: ['HOMEPAGE'],
    touchpointAbbreviations: ['HP'],
    cropsRequired: ['mobile'],
  },
  {
    contentPlanId: 'demo-row-03',
    contentName: 'demo--launch-glp-banner_hero_1',
    componentName: 'Banner Hero',
    channel: '.COM',
    phase: 'Launch',
    touchpoints: ['GENDER LANDING PAGE'],
    touchpointAbbreviations: ['GLP'],
    cropsRequired: ['desktop'],
  },
  {
    contentPlanId: 'demo-row-04',
    contentName: 'demo--launch-glp-card_teaser_1',
    componentName: 'Card Teaser',
    channel: '.COM',
    phase: 'Launch',
    touchpoints: ['GENDER LANDING PAGE'],
    touchpointAbbreviations: ['GLP'],
    cropsRequired: ['mobile'],
  },
  {
    contentPlanId: 'demo-row-05',
    contentName: 'demo--launch-plp-banner_snippet_1',
    componentName: 'Banner Snippet',
    channel: '.COM',
    phase: 'Launch',
    touchpoints: ['PRODUCT LANDING PAGE'],
    touchpointAbbreviations: ['PLP'],
    cropsRequired: ['mobile', 'desktop'],
  },
  {
    contentPlanId: 'demo-row-06',
    contentName: 'demo--launch-app-drop_card_1',
    componentName: 'Drop Card',
    channel: 'FLAGSHIP APP',
    phase: 'Launch',
    touchpoints: ['APP DROP'],
    touchpointAbbreviations: ['App'],
    cropsRequired: ['mobile'],
  },
  {
    contentPlanId: 'demo-row-07',
    contentName: 'demo--launch-app-hero_block_1',
    componentName: 'Hero Block',
    channel: 'CRM',
    phase: 'Launch',
    touchpoints: ['EMAIL HEADER'],
    touchpointAbbreviations: ['CRM'],
    cropsRequired: ['mobile', 'desktop'],
  },
  {
    contentPlanId: 'demo-row-08',
    contentName: 'demo--launch-app-drop_detail_card_1',
    componentName: 'Drop Detail Card',
    channel: 'FLAGSHIP APP',
    phase: 'Launch',
    touchpoints: ['APP DROP DETAIL'],
    touchpointAbbreviations: ['App'],
    cropsRequired: ['mobile'],
  },
];

function buildPlaceholderPayload(campaignId) {
  const skippedComponents = new Set();
  const touchpoints = PLACEHOLDER_TOUCHPOINTS_BASE.map((base) => {
    const dimMap = COMPONENT_DIMENSIONS[base.componentName] || null;
    const skipped = !dimMap && base.cropsRequired.length > 0;
    if (skipped) skippedComponents.add(base.componentName);
    const crops = [];
    if (dimMap) {
      for (const device of base.cropsRequired) {
        const dims = dimMap[device];
        if (dims) crops.push({ device, width: dims[0], height: dims[1] });
      }
    }
    return {
      ...base,
      guidelines: '',
      creativeGuidance: '',
      copyGuidance: '',
      ctaDestination: '',
      crops,
      skipped,
    };
  });

  return {
    campaignId,
    rowCount: touchpoints.length,
    cropCount: touchpoints.reduce((acc, t) => acc + t.crops.length, 0),
    skippedComponents: [...skippedComponents],
    touchpoints,
  };
}

export default async function airtableRoutes(fastify, options) {
  const { getSupabaseClient, DEFAULT_SUPABASE_PROJECT_ID } = fastify;

  fastify.get('/api/airtable/campaigns/:campaignId/touchpoints', async (request, reply) => {
    const auth = request.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return reply.status(401).send({ error: 'Missing bearer token' });

    const supabase = getSupabaseClient(DEFAULT_SUPABASE_PROJECT_ID);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    const campaignId = (request.params.campaignId || '').trim();
    if (!/^[A-Za-z0-9]{10,30}$/.test(campaignId)) {
      return reply.status(400).send({ error: 'Invalid campaign ID format' });
    }

    if (campaignId.toLowerCase() !== PLACEHOLDER_CAMPAIGN_ID.toLowerCase()) {
      return reply.status(404).send({
        error: `Airtable integration is paused. Use placeholder campaign ID: ${PLACEHOLDER_CAMPAIGN_ID}`,
      });
    }

    return reply.send(buildPlaceholderPayload(PLACEHOLDER_CAMPAIGN_ID));
  });
}
