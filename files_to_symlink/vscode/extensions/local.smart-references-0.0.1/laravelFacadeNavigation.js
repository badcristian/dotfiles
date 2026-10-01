// A facade class is a forwarding shell: Cmd+B on `AccessChangeService::` lands on the Facade
// subclass, while the code worth reading is the class it proxies. These read which class that is,
// from `getFacadeAccessor()` returning `X::class`, else the `@mixin` tag ide-helper style facades carry.
const CLASS_NAME = '\\\\?(?:[A-Za-z_\\x80-\\xff][A-Za-z0-9_\\x80-\\xff]*\\\\)*[A-Za-z_\\x80-\\xff][A-Za-z0-9_\\x80-\\xff]*';

const FACADE_CLASS_PATTERN = new RegExp(`\\bclass\\s+[A-Za-z_\\x80-\\xff][A-Za-z0-9_\\x80-\\xff]*\\s+extends\\s+(${CLASS_NAME})`);
const ACCESSOR_RETURN_PATTERN = new RegExp(`function\\s+getFacadeAccessor\\s*\\([^)]*\\)[^{]*\\{\\s*return\\s+(${CLASS_NAME})\\s*::\\s*class\\s*;`);
const MIXIN_PATTERN = new RegExp(`@mixin\\s+(${CLASS_NAME})`);

// Only a direct `extends Facade`: a facade extending another app facade is rare enough to skip.
function getFacadeTargetClassName(source) {
	const parent = FACADE_CLASS_PATTERN.exec(source)?.[1];

	if (!parent || parent.split('\\').pop() !== 'Facade') {
		return undefined;
	}

	return ACCESSOR_RETURN_PATTERN.exec(source)?.[1] ?? MIXIN_PATTERN.exec(source)?.[1];
}

module.exports = {
	getFacadeTargetClassName,
};
