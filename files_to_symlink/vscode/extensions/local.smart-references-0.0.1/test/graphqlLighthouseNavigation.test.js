const test = require('node:test');
const assert = require('node:assert/strict');

const {
	getGraphqlClassReferenceAt,
	findGraphqlClassReferences,
	splitClassReference,
} = require('../graphqlLighthouseNavigation');

const schema = `extend type Query @guard {
    searchMetaCauses(search: String!): [MetaCauseOption]
    @field(resolver: "App\\\\GraphQL\\\\Mutations\\\\MetaCampaignCause@search")
    @can(ability: "manage_analiza_ads_accounts" model: "App\\\\User")
}

extend type Mutation @guard {
    linkMetaCampaignToCause(meta_campaign_id: String!, cause_id: ID): Boolean
    @field(resolver: "App\\\\GraphQL\\\\Mutations\\\\MetaCampaignCause@link")
    @can(ability: "manage_analiza_ads_accounts" model: "App\\\\User")
}

scalar StringOrInt @scalar(class: "App\\\\GraphQL\\\\Scalars\\\\StringOrInt")
`;

test('reads a resolver as a class and a method', () => {
	const reference = getGraphqlClassReferenceAt(schema, schema.indexOf('MetaCampaignCause@search'));

	assert.deepEqual(reference.fqcn, 'App\\GraphQL\\Mutations\\MetaCampaignCause');
	assert.equal(reference.className, 'MetaCampaignCause');
	assert.equal(reference.namespace, 'App\\GraphQL\\Mutations');
	assert.equal(reference.methodName, 'search');
	assert.equal(reference.argument, 'resolver');
});

test('the offsets cover the literal without its quotes', () => {
	const reference = getGraphqlClassReferenceAt(schema, schema.indexOf('MetaCampaignCause@search'));

	assert.equal(schema.slice(reference.start, reference.end), 'App\\\\GraphQL\\\\Mutations\\\\MetaCampaignCause@search');
});

test('a model and a scalar class carry no method', () => {
	const model = getGraphqlClassReferenceAt(schema, schema.indexOf('App\\\\User'));

	assert.equal(model.fqcn, 'App\\User');
	assert.equal(model.className, 'User');
	assert.equal(model.methodName, undefined);
	assert.equal(model.argument, 'model');

	const scalar = getGraphqlClassReferenceAt(schema, schema.indexOf('StringOrInt"'));

	assert.equal(scalar.fqcn, 'App\\GraphQL\\Scalars\\StringOrInt');
	assert.equal(scalar.argument, 'class');
});

test('an ability is not a class reference', () => {
	assert.equal(getGraphqlClassReferenceAt(schema, schema.indexOf('manage_analiza_ads_accounts')), undefined);
});

test('a position outside any literal has no reference', () => {
	assert.equal(getGraphqlClassReferenceAt(schema, schema.indexOf('extend type Query')), undefined);
	assert.equal(getGraphqlClassReferenceAt(schema, schema.indexOf('@field')), undefined);
});

test('finds every site naming the class, and narrows to one method', () => {
	const all = findGraphqlClassReferences(schema, 'App\\GraphQL\\Mutations\\MetaCampaignCause');

	assert.equal(all.length, 2);
	assert.deepEqual(all.map((match) => match.methodName), ['search', 'link']);

	const linkOnly = findGraphqlClassReferences(schema, 'App\\GraphQL\\Mutations\\MetaCampaignCause', 'link');

	assert.equal(linkOnly.length, 1);
	assert.equal(schema.slice(linkOnly[0].start, linkOnly[0].end).endsWith('@link'), true);
});

test('a class named by two different arguments is still the same class', () => {
	const both = 'a @field(resolver: "App\\\\User@show") b @can(model: "App\\\\User")';

	assert.equal(findGraphqlClassReferences(both, 'App\\User').length, 2);
	assert.equal(findGraphqlClassReferences(both, 'App\\User', 'show').length, 1);
});

test('a leading separator is dropped, so both spellings are one class', () => {
	assert.equal(splitClassReference('\\\\App\\\\User').fqcn, 'App\\User');
	assert.equal(splitClassReference('App\\\\User').fqcn, 'App\\User');
});

test('a bare class resolves without a method', () => {
	assert.equal(splitClassReference('App\\\\GraphQL\\\\Queries\\\\Me').methodName, undefined);
});

test('a value shaped like anything but a class name is refused', () => {
	assert.equal(splitClassReference('some thing'), undefined);
	assert.equal(splitClassReference('9Bad\\\\Name'), undefined);
	assert.equal(splitClassReference('has-a-dash'), undefined);
	assert.equal(splitClassReference(''), undefined);
});

test('an unnamespaced value is a class, which is why the argument name is the filter', () => {
	// Lighthouse resolves a bare name against its configured namespaces, so `Me` is a real
	// resolver. `view_analiza_ads` is the same shape and is only ever an `ability:`, which is not
	// one of the class-carrying arguments and so never reaches here.
	assert.equal(splitClassReference('Me').fqcn, 'Me');
	assert.equal(splitClassReference('view_analiza_ads').namespace, '');
});
