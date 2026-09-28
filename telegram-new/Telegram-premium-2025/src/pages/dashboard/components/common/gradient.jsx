export function createChartGradient(ctx, colors, direction = 'vertical') {
    console.log(ctx)
    const chartArea = ctx.chart.chartArea;
    if (!chartArea) return colors[0]; // fallback before initial render

    let x0, y0, x1, y1;

    switch (direction) {
        case 'horizontal':
            x0 = chartArea.left;
            y0 = chartArea.top;
            x1 = chartArea.right;
            y1 = chartArea.top;
            break;
        case 'diagonal':
            x0 = chartArea.left;
            y0 = chartArea.bottom;
            x1 = chartArea.right;
            y1 = chartArea.top;
            break;
        default: // vertical
            x0 = chartArea.left;
            y0 = chartArea.bottom;
            x1 = chartArea.left;
            y1 = chartArea.top;
    }

    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    const step = 1 / (colors.length - 1);

    colors.forEach((color, index) => {
        gradient.addColorStop(step * index, color);
    });

    return gradient;
}