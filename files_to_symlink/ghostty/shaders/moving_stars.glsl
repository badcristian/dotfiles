// Add a sparse, slow-moving star layer over dark terminal backgrounds.
// Light themes return the original terminal frame unchanged.

// tmux-background.sh replaces these values in the generated active shader.
const float STAR_SPEED_MULTIPLIER = 1.00;
const float STAR_DENSITY_START = 0.930;
const float STAR_DENSITY_END = 0.975;
const float STAR_BRIGHTNESS = 0.30;

float luminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

float hash21(vec2 value) {
    value = fract(value * vec2(123.34, 456.21));
    value += dot(value, value + 45.32);
    return fract(value.x * value.y);
}

float starLayer(vec2 position, float scale, float speed, float seed) {
    vec2 grid = position * scale;
    grid += vec2(iTime * speed, iTime * speed * 0.37);

    vec2 cell = floor(grid);
    vec2 local = fract(grid) - 0.5;
    float selector = hash21(cell + seed);
    vec2 offset = vec2(
        hash21(cell + seed + vec2(7.1, 3.7)),
        hash21(cell + seed + vec2(2.9, 8.3))
    ) - 0.5;

  float radius = mix(0.032, 0.078,
                     hash21(cell + seed + vec2(5.2, 1.3)));
  float point = 1.0 - smoothstep(radius, radius + 0.028,
                                 length(local - offset * 0.65));
    float present = smoothstep(STAR_DENSITY_START, STAR_DENSITY_END,
                               selector);
    float twinkleSpeed = mix(0.35, 0.75,
                             hash21(cell + seed + vec2(9.4, 4.6)));
    float twinkle = 0.62 + 0.38 * sin(iTime * twinkleSpeed +
                                      selector * 6.28318530718);

    return point * present * twinkle;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 terminal = texture(iChannel0, uv);

    // Catppuccin Latte is bright, so this becomes zero in light mode.
    float darkTheme = 1.0 - smoothstep(0.35, 0.65,
                                      luminance(iBackgroundColor));
    if (darkTheme <= 0.0) {
        fragColor = terminal;
        return;
    }

    // Normalize by height so the generated points remain circular.
    vec2 position = fragCoord / iResolution.y;
    float stars = starLayer(position, 34.0,
                            0.075 * STAR_SPEED_MULTIPLIER, 11.0) * 0.70;
    stars += starLayer(position, 52.0,
                       -0.052 * STAR_SPEED_MULTIPLIER, 29.0) * 0.48;
    stars += starLayer(position, 78.0,
                       0.035 * STAR_SPEED_MULTIPLIER, 47.0) * 0.30;

    // Avoid drawing moving dots over bright text and UI elements.
    float backgroundMask = 1.0 - smoothstep(0.18, 0.48,
                                            luminance(terminal.rgb));
    vec3 starColor = vec3(0.78, 0.92, 1.0);
    vec3 animated = terminal.rgb +
                    starColor * stars * backgroundMask * darkTheme *
                    STAR_BRIGHTNESS;

    fragColor = vec4(min(animated, vec3(1.0)), terminal.a);
}
