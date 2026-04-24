const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = (env, argv) => {
  const isDev = argv.mode === "development";

  return {
    entry: "./src/loa-battle-engine.ts",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.s[ac]ss$/i,
          use: [MiniCssExtractPlugin.loader, "css-loader", "sass-loader"],
        },
        {
          test: /\.css$/i,
          use: [MiniCssExtractPlugin.loader, "css-loader"],
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
    },
    output: {
      filename: "loa-battle-engine.js",
      path: path.resolve(__dirname, "dist"),
      clean: true,
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: "loa-battle-engine.css",
      }),
    ],
    devtool: isDev ? "eval-source-map" : "source-map",
  };
};
