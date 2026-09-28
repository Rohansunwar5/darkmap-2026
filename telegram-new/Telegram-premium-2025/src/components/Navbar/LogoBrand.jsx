import React from "react";
import BrandName from "../../assets/dmap_name.png";
import Logo from "../../assets/logo_gen.png";

const LogoBrand = () => (
  <div className="flex items-center">
    <div className="flex items-center max-w-[100px]">
      <img
        src={Logo}
        alt="logo"
        className="h-[87px] w-auto"
        style={{ marginRight: "7px", marginLeft: "12px", marginBottom: "6px" }}
      />
    </div>
    <div className="flex items-center">
      <img
        src={BrandName}
        alt="Brand name"
        className="h-[45px] w-auto"
        style={{ marginRight: "10px", marginLeft: "7px" }}
      />
    </div>
  </div>
);

export default LogoBrand;