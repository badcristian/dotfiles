const test = require('node:test');
const assert = require('node:assert/strict');

const { getPhpSignatureSplit } = require('../phpSignatureSplit');

test('splits a method signature and brings the body brace up to the closing parenthesis', () => {
	const split = getPhpSignatureSplit(
		'    public function record(Device $device, string $instanceId, array $counts, ?string $hostname = null): void',
		'    {'
	);

	assert.equal(split.consumesNextLine, true);
	assert.equal(split.replacement, [
		'    public function record(',
		'        Device $device,',
		'        string $instanceId,',
		'        array $counts,',
		'        ?string $hostname = null',
		'    ): void {',
	].join('\n'));
});

test('leaves a brace that already shares the declaration line where it is', () => {
	const split = getPhpSignatureSplit('    public function record(int $a, int $b): void {', '        return;');

	assert.equal(split.consumesNextLine, false);
	assert.equal(split.replacement, [
		'    public function record(',
		'        int $a,',
		'        int $b',
		'    ): void {',
	].join('\n'));
});

test('an abstract or interface declaration keeps its semicolon and takes no brace', () => {
	const split = getPhpSignatureSplit('    abstract public function record(int $a, int $b): void;', '');

	assert.equal(split.consumesNextLine, false);
	assert.equal(split.replacement.split('\n').at(-1), '    ): void;');
});

test('only top-level commas split: array and constructor defaults stay intact', () => {
	const split = getPhpSignatureSplit(
		'    public function record(array $counts = [1, 2, 3], Clock $clock = new Clock(1, 2)): void',
		'    {'
	);

	assert.equal(split.replacement, [
		'    public function record(',
		'        array $counts = [1, 2, 3],',
		'        Clock $clock = new Clock(1, 2)',
		'    ): void {',
	].join('\n'));
});

test('a comma inside a string default is not a separator', () => {
	const split = getPhpSignatureSplit("    public function record(string $sep = ', ', int $limit = 5): void", '    {');

	assert.equal(split.replacement, [
		'    public function record(',
		"        string $sep = ', ',",
		'        int $limit = 5',
		'    ): void {',
	].join('\n'));
});

test('promoted constructor properties keep their visibility and readonly modifiers', () => {
	const split = getPhpSignatureSplit(
		'    public function __construct(private readonly Device $device, protected int $retries = 3)',
		'    {'
	);

	assert.equal(split.replacement, [
		'    public function __construct(',
		'        private readonly Device $device,',
		'        protected int $retries = 3',
		'    ) {',
	].join('\n'));
});

test('a closure keeps everything after the parameter list, including a use clause', () => {
	const split = getPhpSignatureSplit('        $run = function (Device $device, int $retries) use ($clock) {', '');

	assert.equal(split.replacement, [
		'        $run = function (',
		'            Device $device,',
		'            int $retries',
		'        ) use ($clock) {',
	].join('\n'));
});

test('a trailing comma in the parameter list does not become a blank line', () => {
	const split = getPhpSignatureSplit('    public function record(int $a, int $b,): void', '    {');

	assert.equal(split.replacement, [
		'    public function record(',
		'        int $a,',
		'        int $b',
		'    ): void {',
	].join('\n'));
});

test('a single parameter is left alone', () => {
	assert.equal(getPhpSignatureSplit('    public function record(Device $device): void', '    {'), undefined);
});

test('an already split signature is left alone', () => {
	assert.equal(getPhpSignatureSplit('    public function record(', '        Device $device,'), undefined);
});

test('a call is not a declaration', () => {
	assert.equal(getPhpSignatureSplit('        $this->record($device, $instanceId, $counts);', ''), undefined);
});

test('a commented-out declaration is not rewritten', () => {
	assert.equal(getPhpSignatureSplit('    // public function record(int $a, int $b): void', '    {'), undefined);
	assert.equal(getPhpSignatureSplit('     * public function record(int $a, int $b): void', '    {'), undefined);
});
